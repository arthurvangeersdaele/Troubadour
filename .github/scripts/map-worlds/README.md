# Troubadour Map worlds

`hollowmere.py` builds `261108_the_wolves_of_hollowmere.troubadour-map`, a world for the Werewolf party game in three maps
(Dusk: the rules, Night: a house for each role, Day: the body and the debate). Most of its sounds come byte for byte from the
Recueil (docs/recueil, with their sound blocks); four ambiances (woodcutter, carpenter's workshop, farmyard, village well) are
mixed from open-licence one-shots of Stendhal, /tg/station 13 and Cataclysm: DDA CC-Sounds over Recueil beds, and the debate
timer (5 minutes) from Recueil ticking and bells. It needs the blob-less clones and credit files of the tale forge
(`../recueil-tales/`, credits.py), set up as its README says, and ffmpeg.

`four_lands.py` builds `261117_the_four_lands.troubadour-map`, the discovery world of Troubadour Map: one map with an old forest, a silver
lake, a sea of dunes (an oasis, a caravan camp, sunken ruins) and a village, the party starting at the crossroads. Every sound comes byte
for byte from the Recueil with its sound block, so it needs only this repository: `python3 .github/scripts/map-worlds/four_lands.py`
writes it straight into `docs/discovery/maps/`.

`ravenmoor.py` builds `261121_the_werewolves_of_ravenmoor.troubadour-map`, a discovery world for the Werewolf party game in three maps
(Ravenmoor at dusk: the legend and the roles; Ravenmoor by night: the wolves' lair, the seer's tower, the witch's hut, the little girl's
house; the day of judgement: the victim's house, the debate, the gallows), linked by signposts. Only long sounds (10 seconds or more):
music, ambiences and a soundbox of long moments. Its sounds come byte for byte from the Recueil tales Werewolves of Ravenmoor and
Werewolf, plus eleven musics downloaded from Battle for Wesnoth and 0 A.D. and levelled here (ffmpeg and network needed):
`python3 .github/scripts/map-worlds/ravenmoor.py`.
