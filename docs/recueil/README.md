# Recueil

The Recueil of La Troupe: `.troubadour` stories shared by game masters. Browse it at https://arthurvangeersdaele.github.io/Troubadour/troupe/recueil.html

## Add your tale

1. Rhythm your story with the [Story builder](https://arthurvangeersdaele.github.io/Troubadour/troupe/builder.html).
2. [Upload the .troubadour file here](https://github.com/arthurvangeersdaele/Troubadour/upload/main/docs/recueil). GitHub creates a copy of the project in your account and opens a pull request for you.
3. A check runs on the pull request. Once it is merged, the tale appears in the Recueil.

Rules:

- one story per `.troubadour` file, under 100 MB;
- every sound names its source, its author and its licence (the **i** on each card of the Story builder). Accepted licences: CC0, public domain, CC BY, CC BY-SA, OGA-BY, GNU GPL and BSD; non-commercial and no-derivatives licences stay out. Your own recordings are welcome too: tick *I recorded or made it myself*;
- a clear file name, for example `the-drowned-abbey.troubadour`;
- signed **Forgotten Troubadour**, or with your own troubadour name: register it once and for all in Troubadour's settings (Connect with GitHub), then send the tale from that same GitHub account. Only its owner can send tales signed with a registered name;
- a tale already in the Recueil keeps its troubadour: to update yours, rhythm it again (the revision goes up) and send the new file under the same name;
- its sounds also join the sound library of the Story builder (**Recueil sounds**), where other troubadours can pick them one by one for their own tales;
- once in the Recueil, a sound is locked: it is known by its bytes, and its origin and the troubadour who brought it can never change, whichever tale carries it. Its name stays free: the Recueil shows the sound once, with every name troubadours gave it. A crop or a mix of it becomes a new version, kept with the same origin and shown under the sound.

The sounds of the tales rhythmed by Troubadour are credited file by file in [CREDITS.md](CREDITS.md).

The file format is described in [TROUBADOUR_FORMAT.md](../../TROUBADOUR_FORMAT.md). `index.json` and `sounds.json` (the sound library of the Story builder) are rebuilt automatically, and `troubadours.json` (the registered troubadour names) is written by Troubadour's sign-in helper: do not edit them by hand.
