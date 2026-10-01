import { Environment, Lightformer } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { AudioEngine } from './audio';
import { Carousel } from './Carousel';
import { Cassette } from './Cassette';
import { Deck, type DeckUI } from './deck';
import { Player } from './Player';
import { DEFAULT_TRACKS, type Track } from './tracks';
import './sdat.css';

const LOOK = new Vector3(-0.6, 0.5, 0.4);
const CAM = new Vector3(0.6, 9.6, 12.6);
const tmp = new Vector3();

function Director({ deck }: { deck: Deck }) {
  const { camera, size, pointer } = useThree();
  useFrame((_, dt) => {
    deck.update(Math.min(dt, 0.05));
    // Pull back on narrow screens so both the carousel and player fit.
    const aspect = size.width / size.height;
    const k = aspect < 1.55 ? Math.min(2.4, 1.55 / aspect) : 1;
    tmp.set(CAM.x + pointer.x * 0.5, CAM.y + pointer.y * 0.3, CAM.z).sub(LOOK).multiplyScalar(k).add(LOOK);
    camera.position.lerp(tmp, 1 - Math.exp(-3 * dt));
    camera.lookAt(LOOK);
  });
  return null;
}

const STATUS_TEXT: Record<DeckUI['status'], string> = {
  empty: 'NO TAPE',
  loading: 'LOADING',
  reading: 'READING TOC',
  playing: 'NOW PLAYING',
  paused: 'PAUSED',
  stopped: 'STOPPED',
  ejecting: 'EJECTING',
};

export interface SDATPlayerProps {
  /** Cassettes on the carousel. Give a track a `src` to play an audio file instead of the synth. */
  tracks?: Track[];
}

export default function SDATPlayer({ tracks = DEFAULT_TRACKS }: SDATPlayerProps) {
  const [ui, setUi] = useState<DeckUI>({ selected: 0, loaded: null, status: 'empty' });
  const deck = useMemo(() => new Deck(tracks, new AudioEngine(), setUi), [tracks]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => () => deck.engine.stop(), [deck]);

  useEffect(() => {
    const el = root.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Vertical wheels and horizontal trackpad swipes both spin the platter.
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const px = e.deltaMode === 1 ? d * 16 : d;
      deck.scrollBy(Math.max(-1, Math.min(1, px * 0.006)));
    };
    // Dragging left pulls the tapes on the right round to the front.
    let dragX: number | null = null;
    const onDown = (e: PointerEvent) => (dragX = e.clientX);
    const onMove = (e: PointerEvent) => {
      if (dragX === null || !(e.buttons & 1)) return;
      deck.scrollBy((dragX - e.clientX) * 0.01);
      dragX = e.clientX;
    };
    const onUp = () => (dragX = null);
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowRight' && e.shiftKey) deck.press('next');
      else if (k === 'ArrowLeft' && e.shiftKey) deck.press('prev');
      else if (k === 'ArrowRight' || k === 'ArrowDown') deck.scrollBy(1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp') deck.scrollBy(-1);
      else if (k === 'Enter') deck.load(deck.selected);
      else if (k === ' ') deck.press('play');
      else if (k === 'e' || k === 'E') deck.press('open');
      else if (k === 's' || k === 'S') deck.press('stop');
      else return;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [deck]);

  const selected = tracks[ui.selected];
  const loaded = ui.loaded === null ? null : tracks[ui.loaded];

  return (
    <div className="sdat" ref={root}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: CAM.toArray(), fov: 38 }}>
        <color attach="background" args={['#e9dfcc']} />
        <fog attach="fog" args={['#e9dfcc', 18, 34]} />
        <Director deck={deck} />

        <ambientLight intensity={0.35} />
        <directionalLight
          position={[-4, 9, 5]}
          intensity={2.2}
          color="#fff4e2"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-left={-9}
          shadow-camera-right={9}
          shadow-camera-top={7}
          shadow-camera-bottom={-7}
        />
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2.5} position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[12, 6, 1]} />
          <Lightformer form="rect" intensity={1.2} color="#ffe3c2" position={[-8, 3, 4]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
          <Lightformer form="rect" intensity={0.8} color="#b9b0ff" position={[8, 2, -2]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} />
          <Lightformer form="ring" intensity={1.5} position={[2, 4, 8]} scale={3} />
        </Environment>

        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <meshStandardMaterial color="#f3dfbd" roughness={0.95} />
        </mesh>

        <Player deck={deck} />
        <Carousel deck={deck} />
        {tracks.map((t, i) => (
          <Cassette key={t.pgm + t.title} track={t} index={i} deck={deck} />
        ))}
      </Canvas>

      <header className="sdat-card">
        <div className="sdat-card-kicker">DIGITAL AUDIO TAPE</div>
        <div className="sdat-card-title">SDAT</div>
      </header>

      <section className="sdat-now">
        <div className="sdat-now-status" data-status={ui.status}>{STATUS_TEXT[ui.status]}</div>
        <div className="sdat-now-title">
          {loaded ? (
            <>
              <span>PGM {loaded.pgm}</span> {loaded.title}
            </>
          ) : (
            <>
              <span>PGM {selected.pgm}</span> {selected.title}
            </>
          )}
        </div>
      </section>

      <footer className="sdat-hints">
        <span><kbd>scroll</kbd> <kbd>drag</kbd> <kbd>← →</kbd> spin carousel</span>
        <span><kbd>click</kbd> load</span>
        <span><kbd>space</kbd> play / pause</span>
        <span><kbd>shift ← →</kbd> change tape</span>
        <span><kbd>E</kbd> eject</span>
      </footer>
    </div>
  );
}
