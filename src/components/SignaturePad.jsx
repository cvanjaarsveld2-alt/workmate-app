// ─── Signature pad ────────────────────────────────────────────────────────────
// Sign with a finger or mouse; onChange gets a PNG data URL (or null when
// cleared). Used on the customer's quote page and on forms.
import React, { useEffect, useRef, useState } from "react";

export function SignaturePad({ onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = ref.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }, []);
  const pos = e => {
    const r = ref.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = e => {
    drawing.current = true;
    ref.current.setPointerCapture?.(e.pointerId);
    const ctx = ref.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(...pos(e));
  };
  const move = e => {
    if (!drawing.current) return;
    const ctx = ref.current.getContext("2d");
    ctx.lineTo(...pos(e));
    ctx.stroke();
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };
  return (
    <div>
      <canvas
        ref={ref}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        aria-label="Sign here"
        className="w-full h-36 rounded-xl border-2 border-dashed border-slate-300 bg-white touch-none"
      />
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{empty ? "Sign with your finger or mouse" : "Signed"}</span>
        <button type="button" onClick={clear} className="font-bold underline">
          Clear
        </button>
      </div>
    </div>
  );
}
