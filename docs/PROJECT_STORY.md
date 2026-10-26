# Devpost: elevator pitch and project story (copy and paste)

## Elevator pitch (200 characters max)

Scammers rent out homes they don't own on Zillow. Home Lock lets owners lock their home as not for rent and checks every listing against county records and reused photos.

## Project Story

### Inspiration

The idea started with real complaints from renters and owners. People on Reddit and in local news kept describing the same scam. A stranger copies a home's photos from its old sale listing, lists it for rent on Zillow well below market, and asks for a deposit by Zelle before anyone can see the house. A family in Highlands Ranch, Colorado reported their hijacked listing, and it came back with one photo changed. Renters lose their deposits, and owners usually find out from a neighbor.

Zillow's answer today is the same generic "beware of scams" banner on every listing, real or fake, plus taking listings down after someone reports them. Nothing stops anyone from listing an address they don't own. We wanted to build the missing piece: a way for owners to say "my home is **not for rent**," and a way for renters to see *why* a listing can be trusted.

### What it does

**For owners**
- Claim your home and switch on **Not for rent**. Any rental listing of that address is held until you approve it, and you get an alert.
- Owners who never signed up are protected too. When a stranger lists a home that the owner appears to live in, the listing is held and the owner of record is mailed a letter. The code in that letter lets them claim the home and answer.

**For renters**
- Every listing gets a verdict and a score, backed by evidence you can open:
  - The lister compared with the county's owner of record (renters see only a masked name)
  - Whether the owner lives there (their tax mail goes to that address)
  - Photos reused from the home's earlier sale listing, even after cropping, recoloring or watermarking
  - A recent sale, the price compared with HUD area rents, and scam phrases like "out of the country" or "pay by Zelle"

**Against repeat scammers**
- A scam that gets removed can't just come back. Its phone number, payment handles, wording and photos are fingerprinted, so a relist under a new name or at a new address is held.

### How we built it

- **Front end:** vanilla JavaScript ES modules, HTML and CSS, with no framework. It's a recreation of Zillow's rental search layout (map, cards and listing modal), but without Zillow's logo or assets. The map uses Leaflet with OpenStreetMap and CARTO tiles. The motion follows Emil Kowalski's design-engineering principles: custom easing, short transform-only animations, and reduced-motion support.
- **Back end:** a zero-dependency Node.js server that serves the app and proxies the county API for browsers that block the cross-origin call.
- **Public data:**
  - The **Travis Central Appraisal District** parcel layer, through its live ArcGIS REST API, for the owner of record, the owner's mailing address and the deed date
  - **HUD FY2027 Small Area Fair Market Rents** by ZIP code
- **Owner matching:** county records store names like `NGUYEN DAVID & LINH`. So we match names regardless of word order and normalize addresses between listing and county formats.
- **Photo matching:** each photo becomes a small grayscale thumbnail $x$, normalized to zero mean and unit variance. Two photos are compared with normalized cross-correlation:

  $$\rho(x, y) = \frac{1}{n}\sum_{i=1}^{n} \frac{(x_i - \bar{x})(y_i - \bar{y})}{\sigma_x \sigma_y}$$

  We compare over several crop windows and keep the best score. A copy counts as a match when $\rho \ge 0.92$.
- **Relist detection:** we pull phone numbers, emails and cashtags out of the listing and messages. Then we measure how much of the wording overlaps, using the Jaccard similarity of three-word phrases (shingles):

  $$J(A, B) = \frac{|S_3(A) \cap S_3(B)|}{|S_3(A) \cup S_3(B)|}$$

  A shared contact, a matching photo, or $J \ge 0.35$ links a new listing to one that was removed for fraud.
- **Hold rules:** an owner's lock wins first, then a relist match, then an owner notice. Otherwise the listing goes live with its verdict.
- **Tests:** 12 unit tests with `node --test`, plus end-to-end runs in Playwright.
- **Demo assets:** all homes, people and photos in the demo are synthetic, and the photos are generated with Python and Pillow. The demo video's narration uses the open Kokoro text-to-speech model, and ffmpeg assembles it.
- **AI:** we used Claude as a coding and research assistant. The product itself makes **no LLM calls**, so every verdict can be explained and traced back to a public record.

### Challenges we ran into

- **Telling whether the owner lives there.** The county's homestead fields came back empty in the public layer. So we used a signal that is there: whether the owner's tax mailing address is the property itself.
- **Messy public records.** Owner names are stored as "LAST FIRST & SPOUSE," and addresses are written differently from listings ("DR" or "Drive," with or without the unit). Matching them reliably took normalization and order-insensitive comparison.
- **Scammers edit photos.** They crop, recolor and stamp text on copied photos, so exact hashes miss them. Comparing thumbnails over several crop windows fixed that without any image service.
- **Owners who never signed up.** A lock only protects people who know about it, and the owners most at risk usually don't. A mailed letter with a claim code reaches the owner of record without needing them to have an account.
- **Being useful without crying wolf.** A landlord who doesn't live in the home is normal, so "owner doesn't live there" alone can't hold a listing. We only hold when the evidence points the same way.

### What we learned

- Public county records already hold most of what's needed to catch this scam. The hard part is joining them to listings carefully.
- Explainable checks build more trust than a black-box score. Renters can see each piece of evidence, and owners know exactly why a listing was held.
- The real gap is in Zillow's process, not in its data: who is allowed to list an address, and what happens when a removed scam comes back.

### What's next

- Flag rental listings of homes that are currently listed for sale.
- Check property managers' license numbers against the state real estate commission.
- Expand from Travis County to other counties' public parcel APIs, starting with the metros that get the most scam reports.
