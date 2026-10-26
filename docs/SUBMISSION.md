# Devpost submission text (copy and paste)

**Project name:** Home Lock for Zillow Rentals

**App upgraded:** Zillow (Rentals)

**Tagline:** Scammers can rent out your house on Zillow. Home Lock lets owners lock their home as "not for rent" and shows renters the evidence behind every listing.

## Problem statement (2 to 3 sentences)

Scammers copy a home's photos from its old sale listing, list it for rent on Zillow far below market, and collect deposits from renters who find an empty lockbox. Homeowners usually find out from a neighbor, and a listing removed after a report can reappear with one photo changed. Zillow's only defenses are a generic "beware of scams" banner on every listing and removing fakes after the fact.

## Before and after

- **Before:** every listing shows the same generic scam warning, anyone can list any address for rent, and renters must check county records themselves. (screenshot: `docs/screenshots/before.png`)
- **After:** owners claim their home and switch on *Not for rent*, so any rental listing of that address is held until they approve it, and they get an alert. Renters see a verdict on every listing, backed by evidence: the lister vs. the county's owner of record, whether the owner lives there, photos reused from the home's earlier listing, a recent sale, the price vs. HUD area rents, and scam phrases. Owners who never signed up are still protected: when a stranger lists a home its owner appears to live in, the listing is held and the owner of record is mailed a letter whose code lets them claim the home and answer. And a scam that's removed can't simply come back: its phone number, payment handles, wording and photos are fingerprinted, so a relist under a new name or at a new address is held. (screenshots: `docs/screenshots/after-scam.png`, `photo-evidence.png`, `letter.png`, `relist.png`, `owner-alert.png`)

## How it works (tools, APIs, languages, AI)

- **Languages:** JavaScript (ES modules, no framework), HTML and CSS, Node.js (built-ins only) for the dev server and proxy, Python with Pillow for the synthetic demo photos.
- **UI:** a recreation of Zillow's rental search layout (map, cards, listing modal) without Zillow's logo or assets; Leaflet with OpenStreetMap and CARTO tiles for the map; motion built on Emil Kowalski's design-engineering principles (custom easing, short transform-only animations, reduced-motion support).
- **Public data:** Travis Central Appraisal District parcel records (live ArcGIS REST API) for owner of record, owner mailing address and deed date; HUD FY2027 Small Area Fair Market Rents by ZIP code.
- **Algorithms:** order-insensitive owner name matching that handles county formats like "LAST FIRST & SPOUSE"; address normalization between listing and county formats; perceptual photo matching (normalized thumbnails with cross-correlation over crop windows) that survives cropping, recoloring and watermarks; a rules engine for scam language; relist fingerprints (contact and payment-handle extraction, three-word phrase overlap, photo matching); hold rules that decide whether a new listing goes live, waits for the owner, or is held as a relist; a verdict from the combined evidence.
- **AI:** Claude (Anthropic) was used as a coding and research assistant. The product itself makes no LLM calls: every verdict is explainable and traceable to a public record.

## How Zillow could roll it out (one sentence)

Add the "Not for rent" switch to Zillow's existing claim-your-home flow and run the evidence checks on every new rental listing, starting with owner-occupied homes in the metros with the most scam reports.

## Links to fill in

- Demo video (3 minutes or less): _YouTube, Vimeo or Loom link_
- Source code: https://github.com/debi910/zillow-home-lock
- Live link (optional): _GitHub Pages link, if enabled_
- Team members: _names and emails, matching the registration_
