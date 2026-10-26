import json, soundfile as sf, numpy as np
from kokoro_onnx import Kokoro
k = Kokoro("/home/claude/tts/kokoro.onnx", "/home/claude/tts/voices.bin")
for name, text in json.load(open("narration.json")):
    s, sr = k.create(text, voice="af_heart", speed=0.98, lang="en-us")
    # trim leading/trailing near-silence, keep 80ms
    idx = np.where(np.abs(s) > 0.01)[0]
    s = s[max(0, idx[0]-int(.08*sr)): idx[-1]+int(.12*sr)]
    sf.write(f"audio/{name}.wav", s, sr)
    print(name, round(len(s)/sr, 2))
