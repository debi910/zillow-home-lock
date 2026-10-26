# Demo video script (about 2 minutes 45 seconds)

Before recording: run `npm start`, open http://localhost:8080, click **Reset demo** in the top bar, and zoom the browser to 110%.

| Time | Screen | Say |
|---|---|---|
| 0:00 to 0:20 | News headline (Denver7 story) or the README problem section | "A family in Colorado found their own house listed for rent on Zillow by scammers, using photos from when they bought it. They reported it. It came back with one photo changed. Renters wired deposits and found an empty lockbox." |
| 0:20 to 0:35 | **Rent** page, switch on **Show today's Zillow**, open 2104 Maple Bend Dr | "This is all a renter sees today: the same generic warning on every listing. Nothing stops anyone from listing a home they don't own." |
| 0:35 to 1:20 | Switch it off. The cards and map pins get labels and verified homes move up. Open Maple Bend, scroll through the checks, and drag the photo slider | "This is Home Lock. Every listing gets a verdict with evidence. The lister isn't the owner in county records, and we only show a masked name. The owner's tax mail goes to this very house, so they live here, yet the lister says they're out of the country. All four photos match this home's 2025 sale listing even though they were cropped, brightened and stamped. Rent is 54% below HUD's rate for the ZIP. And the messages ask for Zelle and WhatsApp." |
| 1:20 to 1:30 | Open 4710 Oak Shadow Ln | "A real owner's listing passes: name match, normal price, no red flags." |
| 1:30 to 1:50 | **Manage Rentals**, preset *Scammer*: publish 905 Cedar Ridge Cv, then *See the letter we mailed* | "The owner has never heard of Home Lock, but county records say she lives here, so the listing is held, and Home Lock mails her a letter at the address on her tax bill." |
| 1:50 to 2:10 | **For Owners**: enter the letter code and "Anjali Patel", click **Not me, block and report**, switch on **Not for rent** | "Her name has to match county records. She blocks the listing and locks her home." |
| 2:10 to 2:30 | **Manage Rentals**, preset *Same scammer, new name*: publish | "Scammers come back with a new name, even at a different house. Same phone, same wording: Home Lock links it to the scam it already removed and holds it." |
| 2:30 to 2:45 | **Check a listing**: a real Austin address | "It runs on live public data. Here's a real Austin address checked against Travis County records in real time. Zillow already has home claiming, a photo archive and rent estimates, so it can ship this." |

Tip: if the live lookup is slow on camera, record that segment separately and cut it in.

## Rendered video

A finished narrated cut (2:41, 1080p) is produced by `tools/video/`: `tts.py` voices `narration.json` with the open Kokoro TTS model, `record.mjs` drives the app in headless Chrome and records each scene to match its line, `frame.py` draws the browser frame, `music.py` synthesizes the background bed, and `build.py` adds crossfades, captions and the audio mix. Captions for uploading are in `docs/home-lock-demo.srt`. The voice and music are generated, so there are no licensing issues.
