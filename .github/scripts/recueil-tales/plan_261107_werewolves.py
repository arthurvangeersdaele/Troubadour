# Werewolves of Ravenmoor: a tale for the Werewolf party game (Loup Garou).
# Same recipe syntax as the October tales (see the README). Every event and soundbox card lasts 5 s or more:
# short hits are layered over a bed (wind, fire, rain...) with a fixed length.

DOWN = lambda r: f"asetrate=44100*{r},aresample=44100"
ECHO_HALL = "aecho=0.8:0.6:120|260:0.35|0.22"
ECHO_CAVE = "aecho=0.8:0.7:180|420|700:0.4|0.28|0.15"
ECHO_LONG = "aecho=0.8:0.75:300|650|1100|1700:0.45|0.32|0.2|0.12"

WIND = "S:sounds/weather/wind.ogg"
GUST = "Z:weather/windgust_11.ogg"
NIGHT = "W:core/sounds/ambient/night.ogg"
FIRE = "W:core/sounds/ambient/campfire.ogg"
RAIN = "S:sounds/weather/rain_heavy.ogg"


def card(hits, length, bed=WIND, bed_gain=0.35):
    """Layered event: hits = [(ref, delay, gain)], over a bed for `length` seconds."""
    return ("mix", [(bed, 0, bed_gain)] + list(hits), length)


STORIES = [
{"slug": "werewolves-of-ravenmoor", "title": "Werewolves of Ravenmoor",
 "description": "A tale for the Werewolf party game. In the mountain village of Ravenmoor, wolves hide among the villagers: deal the cards at dusk, debate and vote by day, hunt by night, until one side is left. Cards for the Werewolves, the Seer (the Watcher), the Witch, Cupid, the Little Girl, the Hunter, the Thief, the Guard, the Elder and the Mayor.",
 "chapters": [
  {"title": "Dusk: the cards are dealt",
   "description": "The villagers of Ravenmoor gather in the square as the sun goes down. The Mayor is chosen, the cards are dealt face down, and on the first night Cupid binds two lovers while the Thief may steal a role.",
   "music": [("The cards are dealt", "W:core/music/the_deep_path.ogg"), ("Unrest in Ravenmoor", "F:music/unrest_theme.ogg"),
             ("Legends of the wolf", "W:core/music/legends_of_the_north.ogg"), ("Northern dread", "W:core/music/northerners.ogg"),
             ("A cry in the valley", "W:core/music/cry_from_elensefar.ogg")],
   "ambience": [("Village square at dusk", ("mix", [("Z:building/amb_farm_10.ogg", 0, 0.55), (WIND, 0, 0.6)], None)),
                ("Murmurs of the villagers", ("CD:inaudible_chatter.ogg", "lowpass=f=1300,volume=0.9")),
                ("Torches in the wind", ("mix", [(FIRE, 0, 0.8), (GUST, 0, 0.5)], None)),
                ("Ravens on the rooftops", ("mix", [("F:raven_loop.ogg", 0, 0.8), (WIND, 0, 0.4)], None)),
                ("Distant howls", ("mix", [(WIND, 0, 0.5), ("S:sounds/wolf-howl-01.ogg", 3, 0.35), ("S:sounds/wolf-howl-02.ogg", 19, 0.3)], 32), {"filter": "lowpass=f=2500"})],
   "events": [("The town bell gathers the village", ("seq", ["S:sounds/bell-1.ogg"] * 4, 1.6), {"filter": ECHO_LONG}),
              ("The cards are dealt", card([("F:inventory_page.ogg", t, 0.9) for t in (0.4, 1.3, 2.2, 3.1, 4.0, 4.9)], 6.5, FIRE, 0.5)),
              ("Cupid's arrow", card([("W:core/sounds/bow.ogg", 0.3, 0.9), ("W:core/sounds/magic-faeriefire.ogg", 1.0, 0.7), ("F:soundfx/heartbeat.ogg", 1.8, 0.8)], 7.0)),
              ("The lovers are bound", card([("W:core/sounds/magic-holy-2.ogg", 0.2, 0.8), ("TG:effects/health/slowbeat.ogg", 0.8, 0.8), ("W:core/sounds/heal.wav", 3.0, 0.6)], 7.5)),
              ("Night falls on Ravenmoor", card([("S:sounds/werewolf_howl-01.ogg", 0.5, 0.9), ("S:sounds/bell-1.ogg", 3.5, 0.5)], 9.0, NIGHT, 0.7), {"filter": ECHO_CAVE})]},
  {"title": "Day: accusation and vote",
   "description": "Dawn reveals who died in the night. The village argues, accuses and votes, and the one chosen climbs the gallows. If the Hunter falls, he takes someone with him.",
   "music": [("Frantic accusations", "W:core/music/frantic.ogg"), ("Siege of doubt", "W:core/music/siege_of_laurelmor.ogg"),
             ("Weight of revenge", "W:core/music/weight_of_revenge.ogg"), ("Breaking the chains", "W:core/music/breaking_the_chains.ogg"),
             ("The tense square", "SPD:music/city_tense.ogg")],
   "ambience": [("Grey morning", ("mix", [(WIND, 0, 0.7), ("S:sounds/bird-crow-01.ogg", 4, 0.5), ("S:sounds/bird-crow-02.ogg", 19, 0.45), ("F:raven_loop.ogg", 31, 0.5), ("S:sounds/bird-crow-01.ogg", 44, 0.4)], 55)),
                ("Restless villagers", ("CD:inaudible_chatter_2.ogg", "lowpass=f=1500")),
                ("Drums of judgement", "W:core/sounds/ambient/wardrums.ogg"),
                ("Ravens over the gallows", ("mix", [(WIND, 0, 0.6), ("F:raven_loop.ogg", 0, 0.7), (GUST, 0, 0.4)], None)),
                ("Pounding heart", ("mix", [("F:soundfx/heartbeat.ogg", 0, 0.9), (WIND, 0, 0.3)], None))],
   "events": [("A body is found at dawn", card([("S:sounds/bell-1.ogg", 0.2, 0.7), ("TG:mobs/humanoids/human/gasp/gasp_female1.ogg", 1.6, 0.6), ("TG:mobs/humanoids/human/gasp/gasp_male1.ogg", 2.4, 0.6), ("S:sounds/bell-1.ogg", 3.4, 0.5)], 7.0), {"filter": ECHO_HALL}),
              ("Building the gallows", card([("TG:effects/treechop/treechop%d.ogg" % (k % 3 + 1), t, 0.8) for k, t in enumerate((0.3, 1.1, 1.9, 2.7, 3.5, 4.3))] + [("S:sounds/creak-2.ogg", 5.0, 0.6)], 7.0)),
              ("The vote is cast", card([("CD:inaudible_chatter_3.ogg", 0, 0.7), ("W:core/sounds/ambient/wardrums.ogg", 2.0, 0.6), ("S:sounds/bell-1.ogg", 5.2, 0.8)], 8.0)),
              ("Hanged at the gallows", card([("S:sounds/creaky-door-close-1.ogg", 0.3, 0.9), ("TG:effects/bodyfall/bodyfall2.ogg", 0.9, 0.8), ("S:sounds/creak-2.ogg", 1.6, 0.7), ("TG:effects/creak/creak1.ogg", 3.6, 0.5)], 7.5, GUST, 0.45)),
              ("The Hunter's last shot", card([("Z:attack/weapon/Musket_1.ogg", 0.4, 0.9), ("TG:effects/bodyfall/bodyfall3.ogg", 1.5, 0.7)], 6.5), {"filter": ECHO_CAVE})]},
  {"title": "Night: the hunt",
   "description": "Ravenmoor sleeps, or pretends to. The werewolves wake and choose a victim, the Seer turns over a card, the Guard watches a door, the Witch weighs her two potions, and the Little Girl peeks through her fingers.",
   "music": [("The wolves gather", "W:core/music/undead_siege.ogg"), ("Into the dark", "F:music/dungeon_theme.ogg"),
             ("Teeth in the dark", "SPD:music/caves_tense.ogg"), ("Hiding in the shadows", "SPD:music/sewers_tense.ogg"),
             ("The forsaken", "S:music/the_forsaken_mine.ogg")],
   "ambience": [("Village at night", NIGHT), ("Owls in the forest", ("mix", [("F:forest_owl_loop.ogg", 0, 0.9), (WIND, 0, 0.45)], None)),
                ("Wind in the shutters", ("mix", [("S:sounds/weather/wind_heavy.ogg", 0, 0.8), ("S:sounds/creak-2.ogg", 6, 0.3), ("S:sounds/creak-2.ogg", 24, 0.25)], 40)),
                ("Wolves circling", ("mix", [(NIGHT, 0, 0.6), ("OC:WindLoop.ogg", 0, 0.5), ("S:sounds/wolf-growl-01.ogg", 2, 0.5), ("S:sounds/werewolf_growl-02.ogg", 11, 0.45), ("S:sounds/wolf-howl-02.ogg", 19, 0.35), ("S:sounds/werewolf_snarl-01.ogg", 30, 0.45)], 42)),
                ("Restless sleep", ("mix", [("TG:effects/health/fastbeat.ogg", 0, 0.7), (NIGHT, 0, 0.5), ("OC:WindLoop.ogg", 0, 0.4)], None))],
   "events": [("The werewolves awaken", card([("S:sounds/werewolf_growl-01.ogg", 0.3, 0.9), ("S:sounds/werewolf_snarl-01.ogg", 1.8, 0.8), ("S:sounds/werewolf_howl-01.ogg", 3.2, 0.9)], 9.0, NIGHT, 0.6), {"filter": DOWN(0.92) + "," + ECHO_CAVE}),
              ("The wolves strike", card([("S:sounds/werewolf_snarl-01.ogg", 0.2, 0.9), ("W:core/sounds/bite.ogg", 1.0, 0.9), ("S:sounds/wolf-growl-01.ogg", 1.4, 0.7), ("TG:effects/bodyfall/bodyfall1.ogg", 2.2, 0.8), ("S:sounds/werewolf_growl-02.ogg", 3.4, 0.6)], 7.0, NIGHT, 0.6)),
              ("The Seer's vision", card([("TG:effects/magic/castsummon.ogg", 0.3, 0.8), ("TG:ambience/holy/ambiholy2.ogg", 0.6, 0.5), ("W:core/sounds/magic-holy-1.ogg", 2.5, 0.6)], 8.0, NIGHT, 0.4)),
              ("The Witch's brew", card([("TG:effects/bubbles/bubbles.ogg", 0, 0.8), ("F:soundfx/powers/potion.ogg", 2.2, 0.8), ("W:core/sounds/magic-dark.ogg", 3.5, 0.7)], 7.5, FIRE, 0.6)),
              ("The Little Girl peeks", card([("F:soundfx/steps/step_cloth1.ogg", 0.4, 0.8), ("F:soundfx/steps/step_cloth2.ogg", 1.4, 0.8), ("S:sounds/creaky-door-open-1.ogg", 2.4, 0.6), ("F:soundfx/steps/step_cloth3.ogg", 4.4, 0.7), ("TG:effects/health/slowbeat.ogg", 1.0, 0.5)], 7.5, NIGHT, 0.6))]},
  {"title": "The end of the game",
   "description": "The last vote, the last night. Either the village drives out the final werewolf and sees the dawn, or the pack devours the last villagers. And if the lovers are the last two standing, they win together.",
   "music": [("The village falls", "W:core/music/the_city_falls.ogg"), ("Casualties of the night", "W:core/music/casualties_of_war.ogg"),
             ("The last stand", "W:core/music/battle-epic.ogg"), ("The last werewolf", "F:music/boss_theme.ogg"),
             ("Dawn over Ravenmoor", "W:core/music/journeys_end.ogg")],
   "ambience": [("Burning houses", ("mix", [("RE:ambience/fire.ogg", 0, 0.7), (FIRE, 0, 0.8), (WIND, 0, 0.5), (GUST, 0, 0.5)], None)),
                ("Thunderstorm over the valley", "CD:weather/thunderstorm.ogg"),
                ("Ghostly wind", "TG:bloodcult/ghosty_wind.ogg"),
                ("The pack howls", ("mix", [(NIGHT, 0, 0.5), (WIND, 0, 0.45), ("S:sounds/werewolf_howl-01.ogg", 1, 0.45), ("S:sounds/wolf-howl-01.ogg", 9, 0.4), ("S:sounds/wolf-howl-02.ogg", 17, 0.4), ("S:sounds/werewolf_howl-01.ogg", 27, 0.35)], 40), {"filter": "lowpass=f=3000"}),
                ("Dawn after the last night", ("mix", [("W:core/sounds/ambient/morning.ogg", 0, 0.8), (WIND, 0, 0.3)], None))],
   "events": [("The final vote", card([("W:core/sounds/ambient/wardrums.ogg", 0, 0.8), ("S:sounds/bell-1.ogg", 5.0, 0.9), ("S:sounds/bell-1.ogg", 6.6, 0.7)], 9.0, GUST, 0.4), {"filter": ECHO_HALL}),
              ("The last card is revealed", card([("W:core/sounds/magic-dark-big.ogg", 0.3, 0.9), ("OC:Lightning.ocg/Thunder2.ogg", 1.4, 0.8)], 8.0, GUST, 0.4)),
              ("The pack's victory howl", card([("S:sounds/werewolf_howl-01.ogg", 0.2, 1.0), ("S:sounds/wolf-howl-01.ogg", 1.2, 0.7), ("S:sounds/wolf-howl-02.ogg", 2.4, 0.7)], 10.0, NIGHT, 0.5), {"filter": ECHO_CAVE}),
              ("The village is saved", card([("W:core/sounds/magic-holy-3.ogg", 0.2, 0.7), ("CD:church_bells.ogg", 0.8, 0.8)], 12.0, "W:core/sounds/ambient/morning.ogg", 0.6)),
              ("The lovers win together", card([("TG:effects/health/slowbeat.ogg", 0, 0.7), ("W:core/sounds/magic-faeriefire.ogg", 2.2, 0.6), ("W:core/sounds/heal.wav", 3.6, 0.7)], 8.0, "W:core/sounds/ambient/morning.ogg", 0.5))]},
 ],
 "soundbox": [
  # deaths
  ("Death by the wolves", card([("S:sounds/werewolf_snarl-01.ogg", 0.2, 0.9), ("W:core/sounds/bite.ogg", 0.9, 0.9), ("TG:effects/bodyfall/bodyfall4.ogg", 1.6, 0.8), ("S:sounds/bell-1.ogg", 3.2, 0.6)], 7.0, NIGHT, 0.6), {"filter": ECHO_HALL}),
  ("Hanged by the village", card([("W:core/sounds/ambient/wardrums.ogg", 0, 0.5), ("S:sounds/creaky-door-close-1.ogg", 3.0, 0.9), ("TG:effects/bodyfall/bodyfall2.ogg", 3.5, 0.8), ("S:sounds/creak-2.ogg", 4.2, 0.7)], 8.0, GUST, 0.45)),
  ("Poisoned by the Witch", card([("F:soundfx/powers/potion.ogg", 0.2, 0.8), ("TG:effects/curse/curse1.ogg", 1.4, 0.8), ("TG:mobs/humanoids/human/gasp/gasp_male2.ogg", 2.8, 0.6), ("TG:effects/bodyfall/bodyfall3.ogg", 3.8, 0.7)], 7.0, NIGHT, 0.5)),
  ("Shot by the Hunter", card([("Z:attack/weapon/Musket_2.ogg", 0.3, 0.9), ("TG:effects/bodyfall/bodyfall1.ogg", 1.2, 0.8)], 6.0), {"filter": ECHO_CAVE}),
  ("Died of a broken heart", card([("TG:effects/health/slowbeat.ogg", 0, 0.8), ("W:core/sounds/magic-dark-miss.ogg", 3.6, 0.5)], 7.5, NIGHT, 0.5)),
  ("Death knell", ("seq", ["S:sounds/bell-1.ogg"] * 5, 2.2), {"filter": DOWN(0.8) + "," + ECHO_LONG}),
  # weather
  ("Thunder strikes", card([("OC:Lightning.ocg/Thunder4.ogg", 0.2, 1.0)], 7.0, RAIN, 0.5)),
  ("The rain begins", ("TG:ambience/weather/rain/rain_start.ogg", "volume=1.0")),
  ("Howling gale", "Z:weather/windstorm_11.ogg", {"trim": 12}),
  ("Snowstorm rises", "TG:ambience/weather/snowstorm/snow_start.ogg"),
  ("Storm breaks", card([("CD:thunder_near.ogg", 0.5, 1.0), ("S:sounds/weather/thunder-02.ogg", 4.5, 0.6)], 9.0, RAIN, 0.6)),
  # role cards
  ("Werewolf card", card([("S:sounds/werewolf_growl-02.ogg", 0.2, 0.9), ("S:sounds/werewolf_howl-01.ogg", 1.8, 0.8)], 7.0, NIGHT, 0.5), {"filter": ECHO_CAVE}),
  ("Seer card (the Watcher)", card([("TG:effects/magic/blink.ogg", 0.2, 0.7), ("TG:ambience/holy/ambiholy.ogg", 0.4, 0.5), ("W:core/sounds/magic-holy-4.ogg", 2.4, 0.6)], 7.0, NIGHT, 0.3)),
  ("Witch card", card([("TG:effects/bubbles/bubbles2.ogg", 0, 0.8), ("W:core/sounds/magic-dark-big.ogg", 2.0, 0.6), ("F:soundfx/inventory/inventory_potion.ogg", 4.2, 0.8)], 7.0, FIRE, 0.5)),
  ("Cupid card", card([("W:core/sounds/bow.ogg", 0.2, 0.9), ("W:core/sounds/magic-faeriefire.ogg", 0.8, 0.6), ("TG:effects/health/slowbeat.ogg", 2.0, 0.7)], 7.0)),
  ("Little Girl card", card([("F:soundfx/steps/step_cloth4.ogg", 0.3, 0.8), ("S:sounds/creaky-door-open-2.ogg", 1.3, 0.6), ("TG:effects/health/fastbeat.ogg", 2.5, 0.6)], 7.0, NIGHT, 0.5)),
  ("Hunter card", card([("W:core/sounds/bow.ogg", 0.3, 0.7), ("Z:attack/weapon/Musket_3.ogg", 2.0, 0.9)], 6.5), {"filter": ECHO_HALL}),
  ("Thief card", card([("F:soundfx/steps/step_leather1.ogg", 0.3, 0.7), ("F:inventory_page.ogg", 1.4, 0.9), ("F:soundfx/steps/step_leather2.ogg", 2.6, 0.7), ("F:inventory_coins.ogg", 3.6, 0.6)], 6.5, NIGHT, 0.5)),
  ("Guard card", card([("Z:attack/impact/shield_wood_03.ogg", 0.3, 0.8), ("TG:effects/magic/magic_block_holy.ogg", 1.2, 0.7)], 6.0)),
  ("Elder card", card([("TG:ambience/holy/ambicha1.ogg", 0, 0.5), ("S:sounds/bell-1.ogg", 1.0, 0.6)], 7.0, WIND, 0.3)),
  ("Mayor card", card([("S:sounds/bell-1.ogg", 0.2, 0.8), ("S:sounds/bell-1.ogg", 1.6, 0.7), ("CD:inaudible_chatter.ogg", 0, 0.35)], 6.5), {"filter": ECHO_HALL}),
  ("Villager card", card([("Z:singlesteps/fs_gravel2.ogg", 0.4, 0.7), ("Z:singlesteps/fs_gravel5.ogg", 1.0, 0.7), ("S:sounds/creaky-door-close-1.ogg", 2.2, 0.6)], 6.0, "Z:building/amb_farm_10.ogg", 0.5)),
 ]},
]
