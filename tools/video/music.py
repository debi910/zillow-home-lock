# Soft background bed: warm pad chords plus a gentle plucked arpeggio.
import numpy as np, soundfile as sf, sys

SR = 44100
total = float(sys.argv[1]) if len(sys.argv) > 1 else 160.0
bpm = 96
beat = 60 / bpm
bar = beat * 4

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
# Cmaj9, Am9, Fmaj9, G6sus: voicings around middle C.
CHORDS = [
    [48, 55, 59, 62, 64],
    [45, 52, 55, 59, 60],
    [41, 48, 52, 55, 57],
    [43, 50, 55, 57, 62],
]
n = int(total * SR)
t = np.arange(n) / SR
out = np.zeros(n)


# Pad: two bars per chord.
seg = bar * 2
k = 0
while k * seg < total:
    s0 = int(k * seg * SR); s1 = min(n, int((k + 1) * seg * SR + 1.5 * SR))
    tt = np.arange(s1 - s0) / SR
    env = np.minimum(1, tt / 1.2) * np.clip((seg + 1.5 - tt) / 1.5, 0, 1)
    chord = CHORDS[k % 4]
    sig = np.zeros_like(tt)
    for j, m in enumerate(chord):
        f = midi(m + 12)
        for det in (-0.12, 0.12):
            ph = 2 * np.pi * f * (1 + det / 100) * tt
            sig += (np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)) / (1 + j * 0.15)
    sig *= env * (1 + 0.06 * np.sin(2 * np.pi * 0.2 * tt))
    out[s0:s1] += 0.035 * sig
    k += 1

# Arpeggio: eighth notes, plucked sine with soft attack.
step = beat / 2
pattern = [0, 2, 3, 4, 2, 3, 1, 3]
i = 0
while i * step < total - 1:
    ch = CHORDS[int(i * step // seg) % 4]
    m = ch[pattern[i % 8] % len(ch)] + 24
    f = midi(m)
    s0 = int(i * step * SR); L = int(0.9 * SR); s1 = min(n, s0 + L)
    tt = np.arange(s1 - s0) / SR
    env = (1 - np.exp(-tt / 0.004)) * np.exp(-tt / 0.28)
    vel = 0.8 if i % 2 == 0 else 0.6
    out[s0:s1] += 0.05 * vel * env * (np.sin(2 * np.pi * f * tt) + 0.2 * np.sin(4 * np.pi * f * tt))
    i += 1

# Soft low pulse on each beat for momentum.
b = 0
while b * beat < total - 1:
    m = CHORDS[int(b * beat // seg) % 4][0] - 12
    s0 = int(b * beat * SR); s1 = min(n, s0 + int(0.5 * SR))
    tt = np.arange(s1 - s0) / SR
    env = (1 - np.exp(-tt / 0.01)) * np.exp(-tt / 0.18)
    out[s0:s1] += (0.07 if b % 4 == 0 else 0.04) * env * np.sin(2 * np.pi * midi(m) * tt)
    b += 1

# Simple stereo widening with a short delay, fade in/out.
fade = np.ones(n)
fi, fo = int(1.5 * SR), int(4 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo)
out *= fade
d = int(0.012 * SR)
left = out; right = np.concatenate([np.zeros(d), out[:-d]])
st = np.stack([left, right], 1)
st /= np.max(np.abs(st)) / 0.8
sf.write("audio/music.wav", st, SR)
print("music", total)
