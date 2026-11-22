import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Pops/pushes per opcode byte (0-83); invalid bytes are never read: the
// validity check below traps 5 first.
const QP = '000112231111111122222221222122222221111111111111011001111111111112111111111111111101';
const QW = '011022330000000011111111111111111110000000000000000000000000000010000000000000000010';

function run(p: Uint8Array, inp: Uint8Array): { o: Uint8Array; e: number } {
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const B = new Uint8Array(65536);
  let sp = 0, cp = 0, ol = 0, pc = 0, ip = 0, st = 0;
  const T = (c: number) => ({ o: B.slice(0, ol), e: c });
  for (;;) {
    if (st === 1e6) return T(10);
    if (pc < 0 || pc >= p.length) return T(9);
    const op = p[pc];
    if (!(op < 8 || (op > 15 && op < 35 && op !== 31) || (op > 47 && op < 53) || op === 64 || op === 65 || (op > 79 && op < 84))) return T(5);
    const im = op === 2 ? 4 : op === 1 ? 1 : op > 47 && op < 52 ? 2 : 0;
    if (pc + im >= p.length) return T(9);
    st++;
    const nx = pc + 1 + im;
    pc = nx;
    const q = QP.charCodeAt(op) - 48, w = QW.charCodeAt(op) - 48;
    if (sp < q) return T(2);
    if (sp - q + w > 256) return T(3);
    switch (op) {
      case 0: return T(0);
      case 1: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 23: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let t = true;
        if (op !== 48) { const v = D[--sp]; t = op === 49 ? v === 0 : v !== 0; }
        if (t) pc = nx + rel;
        break;
      }
      case 51:
        if (cp === 64) return T(7);
        C[cp++] = nx; pc = p[nx - 2] | (p[nx - 1] << 8); break;
      case 52:
        if (cp === 0) return T(8);
        pc = C[--cp]; break;
      case 64: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return T(6);
        D[sp - 1] = M[a]; break;
      }
      case 65: {
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a > 255) return T(6);
        sp -= 2; M[a] = v; break;
      }
      case 80: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return T(11);
        sp--;
        for (let k = 0; k < s.length; k++) B[ol++] = s.charCodeAt(k);
        break;
      }
      case 81:
        if (ol + 1 > 65536) return T(11);
        B[ol++] = D[--sp] & 255; break;
      case 82: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83: return T(D[--sp] & 255);
      default: {
        const b = D[sp - 1], a = D[sp - 2];
        let r = 0;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) { if (b === 0) return T(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 20) { if (b === 0) return T(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 21) { if (b === 0) return T(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 22) { if (b === 0) return T(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else if (op === 34) r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r;
      }
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.o);
  writeFileSync(join(O, id, 'exit.txt'), r.e + '\n');
}
