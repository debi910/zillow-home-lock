# Assemble the final video: crossfaded scenes, narration, music bed, captions.
import json, re, subprocess, soundfile as sf

ORDER = ["intro", "news", "before", "search", "scam", "photos", "legit", "scammer", "letter", "owner", "relist", "ship", "outro"]
LEAD = 0.6
XF = 0.4
narr = dict(json.load(open("narration.json")))

def probe(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode())

dur = {c: probe(f"framed/{c}.mp4") for c in ORDER}
starts, t = {}, 0.0
for i, c in enumerate(ORDER):
    starts[c] = t
    t += dur[c] - (XF if i < len(ORDER) - 1 else 0)
total = t
print("total", round(total, 2))

# ---------- captions (ASS) ----------
def ts(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def chunks(text, limit=58):
    # split into sentences, then into lines of at most `limit` chars at word boundaries
    out = []
    for sent in re.split(r"(?<=[.!?])\s+", text.strip()):
        words, line = sent.split(), ""
        for w in words:
            if len(line) + len(w) + 1 > limit and line:
                out.append(line); line = w
            else:
                line = (line + " " + w).strip()
        if line: out.append(line)
    return out

def spoken(s):  # how captions should read vs. how the voice was spelled
    return s.replace("H-U-D", "HUD").replace("Zest-imate", "Zestimate")

events = []
for c in ORDER:
    if c == "outro":
        continue  # the end card shows the line itself
    a = f"audio/{c}.wav"
    d = sf.info(a).duration
    parts = chunks(spoken(narr[c]))
    weights = [len(p) + 6 for p in parts]
    tot = sum(weights); cur = starts[c] + LEAD
    for p, w in zip(parts, weights):
        span = d * w / tot
        events.append((cur, cur + span - 0.05, p)); cur += span

ass = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter,40,&H00FFFFFF,&H00FFFFFF,&H18201812,&H18201812,-1,0,0,0,100,100,0,0,3,13,0,2,240,240,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
for s, e, p in events:
    ass += f"Dialogue: 0,{ts(s)},{ts(e)},Cap,,0,0,0,,{{\\fad(120,120)}}{p}\n"
open("captions.ass", "w").write(ass)

# ---------- video: xfade chain ----------
inputs = []
for c in ORDER:
    inputs += ["-i", f"framed/{c}.mp4"]
fc, prev, off = [], "0:v", 0.0
for i in range(1, len(ORDER)):
    off += dur[ORDER[i - 1]] - XF
    lab = f"v{i}"
    fc.append(f"[{prev}][{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[{lab}]")
    prev = lab
fc.append(f"[{prev}]ass=captions.ass,fade=t=in:st=0:d=0.5,fade=t=out:st={total - 0.8:.3f}:d=0.8[vout]")

# ---------- audio: narration at scene offsets, music ducked under it ----------
n = len(ORDER)
ain = []
for c in ORDER:
    ain += ["-i", f"audio/{c}.wav"]
ain += ["-i", "audio/music.wav"]
vo = []
for j, c in enumerate(ORDER):
    ms = int((starts[c] + LEAD) * 1000)
    fc.append(f"[{n + j}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={ms}|{ms}[a{j}]")
    vo.append(f"[a{j}]")
fc.append(f"{''.join(vo)}amix=inputs={n}:normalize=0,apad,atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11[voice]")
fc.append("[voice]asplit=2[voiceA][voiceSC]")
fc.append(f"[{2 * n}:a]atrim=0:{total:.3f},volume=0.18[mus]")
fc.append("[mus][voiceSC]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=600[musd]")
fc.append(f"[voiceA][musd]amix=inputs=2:normalize=0,afade=t=out:st={total - 1.2:.3f}:d=1.2,alimiter=limit=0.95[aout]")

cmd = ["ffmpeg", "-y", "-loglevel", "error"] + inputs + ain + [
    "-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "out/home-lock-demo.mp4"]
subprocess.run(cmd, check=True)
json.dump({"total": total, "starts": starts}, open("out/timeline.json", "w"), indent=1)
print("done")
