import type { DetectedChapter, ConvertedChapter } from "@shared/schema";

export const DEMO_CHAPTERS: DetectedChapter[] = [
  {
    number: 1,
    title: "The Discovery",
    wordCount: 2450,
    briefSummary:
      "Dr. Elena Vasquez leads a deep-space expedition aboard the research vessel Prometheus. During a routine mineral survey of asteroid KX-47, the crew discovers an artificial structure buried beneath the surface — an impossibly ancient alien monolith emitting a low-frequency signal.",
    estimatedPages: 10,
  },
  {
    number: 2,
    title: "First Contact",
    wordCount: 3200,
    briefSummary:
      "The crew enters the monolith's chamber. Inside, holographic projections reveal star maps and images of a civilization that existed millions of years ago. Communications Officer James Chen decodes fragments of the signal, realizing it's a warning — something is coming.",
    estimatedPages: 13,
  },
  {
    number: 3,
    title: "The Signal",
    wordCount: 1800,
    briefSummary:
      "The monolith's signal intensifies, disrupting the ship's systems. Engineer Kofi Asante races to keep life support online while Vasquez makes the impossible choice: transmit a response into deep space, or destroy the monolith and flee before whatever sent the warning arrives.",
    estimatedPages: 7,
  },
];

export const DEMO_CONVERTED: Record<number, ConvertedChapter> = {
  1: {
    chapterNumber: 1,
    chapterTitle: "The Discovery",
    elements: [
      // ── SCENE 1: Opening — Deep Space ──
      { type: "scene_heading", text: "EXT. DEEP SPACE - ASTEROID BELT KX-47 - NIGHT" },
      {
        type: "action",
        text: "Stars stretch to infinity. A cold, silent canvas of black punctuated by the faint glow of distant nebulae. The asteroid belt drifts in slow, ancient rotation — tumbling rocks the size of cathedrals catching slivers of starlight.",
      },
      {
        type: "action",
        text: "A shape emerges from the darkness: the RSV PROMETHEUS, a deep-space research vessel. Angular and utilitarian, her hull scarred by micro-impacts from years of frontier survey work. Running lights pulse in measured intervals along her spine.",
      },
      { type: "transition", text: "PUSH IN ON THE BRIDGE VIEWPORT —" },

      // ── SCENE 2: Bridge ──
      { type: "scene_heading", text: "INT. RSV PROMETHEUS - BRIDGE - CONTINUOUS" },
      {
        type: "action",
        text: "Banks of instrument displays cast a blue-white glow across the cramped bridge. Data streams scroll across every surface. A half-eaten protein bar sits beside a coffee mug tethered to the console.",
      },
      {
        type: "action",
        text: "DR. ELENA VASQUEZ (40s, sharp features softened by fatigue, mission commander) stands at the central holographic display. A three-dimensional map of the asteroid belt rotates before her. She traces a trajectory with her finger, and the map responds, zooming into a dense cluster.",
      },
      { type: "character", text: "VASQUEZ" },
      { type: "dialogue", text: "Prometheus, give me the mineral scan on KX-47. Full spectrum." },
      { type: "character", text: "PROMETHEUS (V.O.)" },
      {
        type: "parenthetical",
        text: "(smooth, androgynous — the ship's AI)",
      },
      {
        type: "dialogue",
        text: "Scan initiated. Preliminary analysis shows standard ferrous composition with trace iridium deposits. Estimated survey time: four hours.",
      },
      {
        type: "action",
        text: "Vasquez nods, but something on the scan catches her eye — a faint anomaly, barely a blip, buried deep beneath the asteroid's surface. She leans closer.",
      },
      { type: "character", text: "VASQUEZ" },
      { type: "parenthetical", text: "(to herself)" },
      { type: "dialogue", text: "That's not iridium." },
      {
        type: "action",
        text: "LIEUTENANT YUKI KIMURA (30s, compact, precise — the pilot) glances up from the navigation console. Her hands rest on the manual flight controls, a habit from her military days.",
      },
      { type: "character", text: "KIMURA" },
      { type: "dialogue", text: "Problem, Commander?" },
      { type: "character", text: "VASQUEZ" },
      {
        type: "dialogue",
        text: "Probably nothing. There's a density anomaly about two hundred meters below the surface of KX-47. Could be a void, could be a sensor ghost.",
      },
      { type: "character", text: "KIMURA" },
      { type: "parenthetical", text: "(skeptical)" },
      { type: "dialogue", text: "Or it could be another four hours of overtime for nothing." },
      {
        type: "action",
        text: "Vasquez allows herself a thin smile. She taps the comms panel.",
      },
      { type: "character", text: "VASQUEZ" },
      {
        type: "dialogue",
        text: "Chen, Asante — report to the bridge. We've got something worth looking at.",
      },

      // ── SCENE 3: Approach ──
      { type: "scene_heading", text: "EXT. ASTEROID KX-47 - SPACE - LATER" },
      {
        type: "action",
        text: "The Prometheus descends toward KX-47, dwarfed by the asteroid's pockmarked mass. Thrusters fire in controlled bursts, adjusting course with surgical precision. The asteroid's surface is a landscape of frozen violence — craters upon craters, razor-sharp ridges, dust that hasn't moved in a billion years.",
      },
      { type: "scene_heading", text: "INT. RSV PROMETHEUS - BRIDGE - CONTINUOUS" },
      {
        type: "action",
        text: "The full crew is assembled. JAMES CHEN (30s, lean, restless intelligence behind wire-frame glasses — communications officer) studies the signal analysis on his display. KOFI ASANTE (40s, broad-shouldered, methodical — chief engineer) monitors the ship's power systems as they enter the asteroid's weak gravitational field.",
      },
      { type: "character", text: "CHEN" },
      {
        type: "dialogue",
        text: "Commander, I'm picking up something strange. There's a low-frequency emission from the anomaly site. Extremely faint — point-zero-three hertz.",
      },
      { type: "character", text: "ASANTE" },
      {
        type: "dialogue",
        text: "That's below human hearing. How are the instruments even catching it?",
      },
      { type: "character", text: "CHEN" },
      { type: "parenthetical", text: "(a beat, troubled)" },
      { type: "dialogue", text: "Because it's perfectly regular. That's not geological, Kofi. That's a signal." },
      {
        type: "action",
        text: "Silence on the bridge. The weight of the statement settles over them like a pressure change. Vasquez stares at the holographic display, where the anomaly pulses with a rhythm that is unmistakably deliberate.",
      },
      { type: "character", text: "PROMETHEUS (V.O.)" },
      {
        type: "dialogue",
        text: "Confirmed. Emission pattern analysis indicates an artificial origin. Confidence: ninety-seven point four percent.",
      },
      { type: "character", text: "KIMURA" },
      { type: "parenthetical", text: "(under her breath)" },
      { type: "dialogue", text: "Mother of God." },
      { type: "character", text: "VASQUEZ" },
      {
        type: "dialogue",
        text: "Kimura, take us into a holding orbit. Two hundred meters above the source. Chen, I want every sensor we have pointed at that anomaly. Asante, prep the drill rover.",
      },
      { type: "character", text: "ASANTE" },
      { type: "parenthetical", text: "(carefully)" },
      {
        type: "dialogue",
        text: "Elena — shouldn't we report this to Mission Control before we go digging?",
      },
      { type: "character", text: "VASQUEZ" },
      {
        type: "dialogue",
        text: "Mission Control is fourteen light-minutes away. By the time they respond, we'll either have answers or more questions. Prep the rover.",
      },
      { type: "transition", text: "CUT TO:" },

      // ── SCENE 4: Surface Operations ──
      { type: "scene_heading", text: "EXT. ASTEROID KX-47 - SURFACE - LATER" },
      {
        type: "action",
        text: "The drill rover, a squat robotic vehicle bristling with mining equipment, crawls across the asteroid's surface in near-zero gravity. Tethered cables trail back to the Prometheus hovering above. Dust motes drift upward in slow motion, disturbed by the rover's treads.",
      },
      { type: "scene_heading", text: "INT. RSV PROMETHEUS - BRIDGE - CONTINUOUS" },
      {
        type: "action",
        text: "Vasquez and Chen watch the rover's camera feed. Asante operates the drill remotely from the engineering station, his thick fingers moving with surprising delicacy over the control interface.",
      },
      { type: "character", text: "ASANTE" },
      { type: "dialogue", text: "Drill at one hundred meters. Rock composition nominal. Hitting the density anomaly boundary... now." },
      {
        type: "action",
        text: "The drill telemetry goes haywire. Resistance drops to zero. The bit spins freely.",
      },
      { type: "character", text: "ASANTE" },
      { type: "parenthetical", text: "(alarmed)" },
      { type: "dialogue", text: "We've broken through into a cavity. A big one." },
      { type: "character", text: "CHEN" },
      {
        type: "dialogue",
        text: "The signal just tripled in strength. Whatever is down there knows we're here.",
      },
      {
        type: "action",
        text: "Vasquez grips the edge of the console. On the rover's camera feed, the drill hole has become a dark mouth in the asteroid's surface. Faint light — impossible light — glows from within.",
      },
      { type: "character", text: "VASQUEZ" },
      { type: "dialogue", text: "Deploy the camera probe." },

      // ── SCENE 5: The Monolith ──
      { type: "scene_heading", text: "INT. ASTEROID KX-47 - SUBTERRANEAN CAVITY - CONTINUOUS" },
      {
        type: "action",
        text: "CAMERA PROBE POV: The tiny lens descends through the drill shaft, rock walls giving way to smooth, machined surfaces. The probe emerges into a vast underground chamber — far larger than should exist inside an asteroid this size.",
      },
      {
        type: "action",
        text: "And there it stands.",
      },
      {
        type: "action",
        text: "A MONOLITH. Obsidian black. Perfectly rectangular. Twenty meters tall. Its surface is flawless — no seams, no markings, no visible means of construction. It absorbs light rather than reflecting it, a geometric void cut into reality itself.",
      },
      {
        type: "action",
        text: "Faint luminescence pulses along the chamber walls in rhythm with the signal — as if the rock itself is breathing.",
      },
      { type: "scene_heading", text: "INT. RSV PROMETHEUS - BRIDGE - CONTINUOUS" },
      {
        type: "action",
        text: "The crew stares at the feed in stunned silence. The monolith fills the screen, impossibly perfect against the raw stone. Nobody speaks. Nobody breathes.",
      },
      { type: "character", text: "CHEN" },
      { type: "parenthetical", text: "(whispered)" },
      { type: "dialogue", text: "It's been here for... Prometheus, what's the geological age of the surrounding rock?" },
      { type: "character", text: "PROMETHEUS (V.O.)" },
      {
        type: "dialogue",
        text: "Based on isotope decay analysis, the surrounding strata formed approximately four point six billion years ago. The object predates the formation of our solar system.",
      },
      {
        type: "action",
        text: "Kimura turns away from her console to look at Vasquez. Asante removes his hands from the controls and lets them rest in his lap. Chen pushes his glasses up his nose with a trembling finger.",
      },
      { type: "character", text: "VASQUEZ" },
      {
        type: "action",
        text: "Vasquez stares at the monolith on the screen. Her reflection floats ghostlike on the glass, superimposed over the alien geometry. When she speaks, her voice is steady, but her eyes betray the enormity of what she is feeling.",
      },
      { type: "character", text: "VASQUEZ" },
      {
        type: "dialogue",
        text: "We need to go down there.",
      },
      { type: "character", text: "ASANTE" },
      { type: "parenthetical", text: "(quiet, resolute)" },
      { type: "dialogue", text: "I'll prep the EVA suits." },
      {
        type: "action",
        text: "On the screen, the monolith pulses once — a single, slow throb of light that travels from base to apex — as if acknowledging their decision.",
      },
      { type: "character", text: "PROMETHEUS (V.O.)" },
      {
        type: "dialogue",
        text: "Commander, I am detecting a new pattern in the signal. It appears to be... directed. Toward us.",
      },
      {
        type: "action",
        text: "CLOSE ON VASQUEZ — her face illuminated by the glow from the screen, eyes wide, reflecting the monolith's impossible geometry. The hum of the signal reverberates through the ship, felt in the bones more than heard.",
      },
      {
        type: "action",
        text: "She takes a breath.",
      },
      { type: "character", text: "VASQUEZ" },
      { type: "parenthetical", text: "(almost to herself)" },
      { type: "dialogue", text: "It's been waiting." },
      { type: "transition", text: "SMASH CUT TO BLACK." },
    ],
    pageCount: 10,
    sceneCount: 5,
  },
};
