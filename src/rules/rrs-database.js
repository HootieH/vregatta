/**
 * Racing Rules of Sailing (RRS) database for the vRegatta learning engine.
 *
 * Each rule includes the full educational text: rule number, title, short/full text,
 * a detailed explanation, when it applies, what to do, and common mistakes.
 * The goal is to TEACH sailing rules thoroughly, like a coach in your ear.
 */

const rules = [
  {
    number: '10',
    title: 'On Opposite Tacks',
    shortText: 'Port keeps clear of starboard',
    fullText: 'When boats are on opposite tacks, a port-tack boat shall keep clear of a starboard-tack boat.',
    explanation:
      'This is the single most important right-of-way rule in sailing and the one invoked most often on the racecourse. ' +
      'A boat is on starboard tack when the wind is coming over her starboard (right) side, which means the boom is on the port (left) side. ' +
      'Conversely, a boat is on port tack when the wind comes over the port side (boom to starboard). ' +
      'When two boats on opposite tacks meet, the port-tack boat MUST keep clear. It does not matter who is ahead, who is to windward, ' +
      'or who got there first. Tack determines everything.\n\n' +
      'In practice, this rule creates the most dramatic encounters on the racecourse. Picture two boats approaching each other on a beat ' +
      'to windward: one on port tack, one on starboard. The starboard-tack boat holds her course and the port-tack boat must either ' +
      'duck behind (bear away to pass astern), tack onto starboard, or slow down and let the starboard boat pass. ' +
      'The key is to act EARLY. Last-second maneuvers are dangerous and often lead to protests.\n\n' +
      'Real-world example: You are beating upwind on port tack. A boat appears on your starboard bow, also beating but on starboard tack. ' +
      'You are on a collision course. YOU must keep clear. Your options: (1) duck behind by bearing away, (2) tack to starboard well ahead, ' +
      'or (3) if there is room, tack directly beneath the other boat (lee-bow). Option 1 is safest. Option 3 is tactically aggressive but risky.',
    whenItApplies: 'Two boats approaching each other on opposite tacks (one on port, one on starboard). This applies whether beating, reaching, or running.',
    whatToDo:
      'If you are on PORT tack: you must keep clear. Bear away to pass behind the starboard boat (duck), or tack onto starboard early. ' +
      'Act decisively and early -- do not wait until the last second. ' +
      'If you are on STARBOARD tack: hold your course. You have right of way. However, if it becomes clear the port boat is not going to keep clear, ' +
      'Rule 14 requires you to try to avoid contact if possible. You may hail "STARBOARD!" to alert the other boat.',
    commonMistakes: [
      'Port-tack boat ducking too late, causing the starboard boat to alter course',
      'Starboard boat altering course to hunt port-tackers (you must hold your course, not chase)',
      'Not knowing which tack you are on -- remember: tack is determined by which side the wind comes from, not which way you are heading',
      'Failing to act early enough, leading to a dangerous close-quarters situation',
      'Assuming you have right of way because you are ahead -- tack, not position, determines rights',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 2 - When Boats Meet',
  },
  {
    number: '11',
    title: 'On the Same Tack, Overlapped',
    shortText: 'Windward boat keeps clear of leeward boat',
    fullText: 'When boats are on the same tack and overlapped, a windward boat shall keep clear of a leeward boat.',
    explanation:
      'When two boats are sailing on the same tack and are overlapped (that is, neither is clearly ahead or behind -- they are side by side ' +
      'or nearly so), the boat that is on the windward side (closer to where the wind is coming from) must keep clear of the leeward boat. ' +
      'The leeward boat has right of way.\n\n' +
      'This rule creates fascinating tactical situations. The leeward boat can use her right of way to "luff up" (head toward the wind) ' +
      'to try to slow or force the windward boat to alter course, subject to other rules like Rule 16 (must give room when changing course) ' +
      'and Rule 17 (proper course limitation, if it applies).\n\n' +
      'Two boats are "overlapped" when neither is clear astern of the other. Imagine lines drawn perpendicular to the course of the leading boat ' +
      'at her bow and stern: if any part of the trailing boat is between those lines, they are overlapped.\n\n' +
      'Real-world example: Two boats are reaching toward the leeward mark, side by side on starboard tack. The boat closer to the wind (windward) ' +
      'must stay clear. The leeward boat could luff slightly to protect her position, and the windward boat must respond by heading up or slowing down.',
    whenItApplies: 'Two boats on the same tack, overlapped (side by side or nearly so). Windward boat must keep clear.',
    whatToDo:
      'If you are the WINDWARD boat: keep clear! Stay high enough to give the leeward boat room. Be ready to alter course or slow down if the ' +
      'leeward boat luffs. Do not bear away into the leeward boat.\n' +
      'If you are the LEEWARD boat: you have right of way. You may luff to defend your position, but you must give the windward boat room to respond ' +
      '(Rule 16). Use your advantage tactically -- a slow luff can force the windward boat to sail a longer, less efficient course.',
    commonMistakes: [
      'Windward boat squeezing down on the leeward boat, especially at marks',
      'Not knowing you are overlapped -- always check to leeward and to windward',
      'Leeward boat luffing too sharply without giving the windward boat time to react (violates Rule 16)',
      'Confusing windward/leeward when the wind shifts -- always determine windward relative to current wind direction',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 2 - When Boats Meet',
  },
  {
    number: '12',
    title: 'On the Same Tack, Not Overlapped',
    shortText: 'Clear astern keeps clear of clear ahead',
    fullText: 'When boats are on the same tack and not overlapped, a boat clear astern shall keep clear of a boat clear ahead.',
    explanation:
      'This is the "following" rule. If you are behind another boat (clear astern) and on the same tack, you must keep clear of the boat ahead ' +
      '(clear ahead). This makes intuitive sense -- the boat behind has better visibility and more options to maneuver.\n\n' +
      'A boat is "clear astern" when her hull and equipment in normal position are entirely behind an imaginary line drawn from the aftermost ' +
      'point of the other boat perpendicular to that boat\'s course. Once any part of the astern boat crosses that line, they become overlapped, ' +
      'and Rule 11 (windward/leeward) takes over.\n\n' +
      'This rule is critical during mark roundings and downwind sailing. The boat behind must be patient and find a way to overtake without ' +
      'interfering with the boat ahead. Common overtaking strategies include sailing higher to get an overlap to windward (though then you become ' +
      'the windward boat with obligations under Rule 11), or bearing away to pass to leeward.\n\n' +
      'Real-world example: You are running downwind behind another boat. You want to pass. You cannot simply sail up their transom -- you must keep ' +
      'clear. You need to work to one side, establish an overlap, and then the rules change to Rule 11.',
    whenItApplies: 'Two boats on the same tack where one is clearly behind the other (not overlapped). The boat behind must keep clear.',
    whatToDo:
      'If you are CLEAR ASTERN: keep clear of the boat ahead. Do not sail into their wind shadow and then try to push through. ' +
      'Work to one side to establish an overlap and gain rights under Rule 11.\n' +
      'If you are CLEAR AHEAD: you have right of way. However, if you change course, Rule 16 requires you to give the other boat room to keep clear.',
    commonMistakes: [
      'Astern boat sailing too close to the boat ahead, especially in light air',
      'Not recognizing the transition from clear astern to overlapped -- once overlapped, the rules change',
      'Astern boat thinking they can barge through just because they are faster',
      'Ahead boat making sudden course changes that trap the astern boat (violates Rule 16)',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 2 - When Boats Meet',
  },
  {
    number: '13',
    title: 'While Tacking',
    shortText: 'Keep clear while tacking through head-to-wind',
    fullText:
      'After a boat passes head to wind, she shall keep clear of other boats until she is on a close-hauled course. ' +
      'During that time rules 10, 11 and 12 do not apply. If two boats are subject to this rule at the same time, ' +
      'the one on the other\'s port side or the one astern shall keep clear.',
    explanation:
      'When you are in the process of tacking (turning through the wind), you temporarily lose ALL right-of-way protections. ' +
      'From the moment your bow passes through head-to-wind until you settle onto a close-hauled course on the new tack, ' +
      'you must keep clear of everyone. Rules 10, 11, and 12 are suspended during this vulnerable phase.\n\n' +
      'This rule exists because a tacking boat is in a temporary state of reduced control. She is slowing down, her sails are luffing, ' +
      'and she cannot maneuver effectively. Other boats should not have to dodge a boat that voluntarily put herself in this position.\n\n' +
      'The rule also covers the situation where two boats are tacking simultaneously. In that case, the one on the other\'s port side ' +
      'must keep clear. If one is astern, the astern boat must keep clear.\n\n' +
      'Real-world example: You are on port tack and see a starboard boat coming. You decide to tack to avoid her. But you must complete ' +
      'your tack and be on a close-hauled course BEFORE the other boat arrives. If you tack right in front of her and she has to alter course, ' +
      'you have broken Rule 13. This is called a "lee-bow tack" gone wrong -- you must give the other boat room.',
    whenItApplies:
      'From the moment a boat passes head-to-wind until she reaches a close-hauled course on the new tack. ' +
      'Also applies during tacking at marks and in traffic.',
    whatToDo:
      'If you are TACKING: you have no rights. Complete your tack quickly and cleanly. Do not tack directly in front of another boat ' +
      'unless you are absolutely certain you will be on your new close-hauled course with room to spare before they arrive.\n' +
      'If a boat near you is tacking: you have right of way. Hold your course. But if a collision seems imminent, Rule 14 still applies -- ' +
      'try to avoid contact.',
    commonMistakes: [
      'Tacking too close in front of another boat (the infamous bad lee-bow)',
      'Not completing the tack before expecting right-of-way on the new tack',
      'Forgetting that Rule 13 overrides Rule 10 -- you cannot claim starboard rights while still tacking',
      'Slow, sloppy tacks in heavy traffic that leave you vulnerable for too long',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 2 - When Boats Meet',
  },
  {
    number: '14',
    title: 'Avoiding Contact',
    shortText: 'Every boat must try to avoid contact',
    fullText:
      'A boat shall avoid contact with another boat if reasonably possible. However, a right-of-way boat or one entitled to room or mark-room ' +
      '(a) need not act to avoid contact until it is clear that the other boat is not keeping clear or giving room or mark-room, and ' +
      '(b) shall be exonerated if she breaks this rule and the contact does not cause damage or injury.',
    explanation:
      'Rule 14 is the universal safety net. Even if you have right of way -- even if the other boat is 100% in the wrong -- you must still ' +
      'try to avoid a collision if you can. Sailing is not a demolition derby.\n\n' +
      'However, the rule is nuanced. A right-of-way boat does NOT have to start avoiding contact until it becomes clear the other boat is not ' +
      'going to keep clear. You are allowed to hold your course and trust that the other boat will do the right thing. But once it is obvious ' +
      'they are not going to give way, you must act.\n\n' +
      'The practical threshold is: "Was it clear the give-way boat was not keeping clear?" If yes, you should have done something. ' +
      'If the situation developed so quickly that you could not react, you are usually exonerated.\n\n' +
      'Also important: a right-of-way boat that breaks Rule 14 is exonerated (not penalized) as long as there is no damage or injury. ' +
      'So if two boats bump gently and the right-of-way boat could have avoided it, there is no penalty for the right-of-way boat if no damage occurred.\n\n' +
      'Real-world example: You are on starboard tack, a port-tack boat is not keeping clear. You see the situation developing and you could bear away. ' +
      'If you hold your course and they hit you, you MAY be penalized under Rule 14 if it is judged that you could have avoided the contact. ' +
      'The port boat is still penalized under Rule 10, but you could get Rule 14.',
    whenItApplies: 'Always. Every boat, in every situation, at all times during a race. This is the one rule that never turns off.',
    whatToDo:
      'Always be aware of boats around you. Even when you have right of way, be prepared to take avoiding action. ' +
      'If a collision seems imminent, act. A protest with no damage is better than damage with a clear-cut protest.\n' +
      'If you are the give-way boat: act EARLY so that the right-of-way boat never has to invoke Rule 14.',
    commonMistakes: [
      'Right-of-way boat deliberately holding course to "make a point" when a collision is imminent',
      'Assuming that having right of way means you never have to alter course -- you always must try to avoid contact',
      'Give-way boat not acting early enough, putting both boats in danger',
      'Not understanding that even the right-of-way boat can be penalized if contact causes damage and was avoidable',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 2 - When Boats Meet',
  },
  {
    number: '15',
    title: 'Acquiring Right of Way',
    shortText: 'New right-of-way boat must initially give room',
    fullText:
      'When a boat acquires right of way, she shall initially give the other boat room to keep clear, unless she acquires right of way ' +
      'because of the other boat\'s actions.',
    explanation:
      'This rule is about fairness during transitions. When the right-of-way situation changes -- for example, when a boat establishes ' +
      'an overlap to leeward and becomes the leeward boat with rights under Rule 11 -- the newly-empowered boat cannot immediately demand ' +
      'that the other boat jump out of the way. She must give the other boat time and space to react.\n\n' +
      'Think of it as a grace period. If you sail up from behind and establish a leeward overlap, you just acquired right of way under Rule 11. ' +
      'But the windward boat did not put herself in that position -- you did. So you must give her a moment to adjust.\n\n' +
      'The exception is important: if the OTHER boat\'s actions caused you to acquire right of way (for example, they tacked onto your tack, ' +
      'giving you leeward-boat status), then you do NOT need to give initial room. They put themselves in that situation.\n\n' +
      'Real-world example: You are sailing fast on a reach and you catch up to a slower boat. You establish a leeward overlap. ' +
      'Under Rule 11, you now have right of way. But under Rule 15, you cannot immediately luff up and force the windward boat to alter course. ' +
      'You must give her room to recognize the situation and respond.',
    whenItApplies:
      'Whenever the right-of-way situation changes: a new overlap is established, a boat completes a tack and gains rights, ' +
      'or any other transition that creates a new right-of-way relationship.',
    whatToDo:
      'If you just GAINED right of way: give the other boat a moment to react. Do not immediately exercise your rights aggressively. ' +
      'Sail a steady course for a few seconds.\n' +
      'If the other boat just gained right of way over you: respond promptly! The grace period is short. Start adjusting your course immediately.',
    commonMistakes: [
      'Leeward boat immediately luffing hard after just establishing an overlap from behind',
      'Not understanding the "other boat\'s actions" exception -- if they tacked into you, no grace period is needed',
      'Windward boat ignoring the new overlap and not responding during the grace period',
      'Confusing Rule 15 with Rule 16 -- Rule 15 is about the initial moment of acquiring rights, Rule 16 is about any course change',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 2 - When Boats Meet',
  },
  {
    number: '16',
    title: 'Changing Course',
    shortText: 'Right-of-way boat must give room when changing course',
    fullText:
      'When a right-of-way boat changes course, she shall give the other boat room to keep clear.',
    explanation:
      'A right-of-way boat can change course -- that is her prerogative. But when she does, she must give the give-way boat enough room ' +
      'and time to respond. You cannot make sudden, unexpected alterations that trap the other boat.\n\n' +
      'This rule works hand-in-hand with Rules 11 and 12. The leeward boat has right of way, and she is allowed to luff (head up toward the wind) ' +
      'to defend her position. But she must luff gradually enough that the windward boat can respond. A sharp, aggressive luff that gives no time ' +
      'to react violates Rule 16.\n\n' +
      'The test is: "Was the give-way boat able to keep clear?" If you change course and the other boat could not respond in time, ' +
      'you broke Rule 16, even though you had right of way.\n\n' +
      'Real-world example: You are the leeward boat on a reach. A boat is overlapped to windward. You decide to luff to slow them down. ' +
      'You head up gradually over several seconds. The windward boat has time to respond and heads up too. This is fine. ' +
      'But if you suddenly bear away and then immediately luff sharply, the windward boat may not be able to react -- that violates Rule 16.',
    whenItApplies:
      'Any time a right-of-way boat changes course while near a give-way boat. Applies whether luffing, bearing away, or making any course alteration.',
    whatToDo:
      'If you have right of way and want to change course: do it GRADUALLY. Give the other boat time to see your course change and respond. ' +
      'The closer the boats, the more gentle your course change should be.\n' +
      'If you are the give-way boat and the right-of-way boat changes course: respond immediately. But if the change was too sudden for you to react, ' +
      'you may have grounds for a protest under Rule 16.',
    commonMistakes: [
      'Leeward boat luffing sharply and aggressively without warning',
      'Right-of-way boat bearing away suddenly into the path of a give-way boat',
      'Not understanding that right of way does NOT mean you can do anything you want',
      'Give-way boat not responding promptly to a legitimate, gradual course change',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 2 - When Boats Meet',
  },
  {
    number: '17',
    title: 'On the Same Tack; Proper Course',
    shortText: 'Leeward boat from clear astern may not sail above proper course',
    fullText:
      'If a boat clear astern becomes overlapped within two of her hull lengths to leeward of a boat on the same tack, ' +
      'she shall not sail above her proper course while they remain on the same tack and overlapped within that distance, ' +
      'unless after doing so the windward boat promptly sails astern of her. This rule does not apply if the overlap ' +
      'begins while the windward boat is required by rule 13 to keep clear.',
    explanation:
      'Rule 17 is a limitation on the leeward boat\'s right to luff. Normally, the leeward boat has right of way (Rule 11) and can luff. ' +
      'But Rule 17 puts a brake on this when the leeward boat got her overlap from BEHIND and CLOSE (within two hull lengths).\n\n' +
      'The reasoning is fair: if you sneak up from behind and establish a leeward overlap very close, you should not then be able to ' +
      'immediately luff the windward boat aggressively. You "chose" the close overlap. So you are limited to sailing your proper course -- ' +
      'the course you would sail if the other boat were not there.\n\n' +
      'However, if you established the overlap from a distance (more than two hull lengths), Rule 17 does NOT apply, and you can luff freely.\n\n' +
      'Note: In VR Inshore, "hull lengths" are game units, and overlaps at close range are the norm during mark roundings and reaching legs.\n\n' +
      'Real-world example: You are running downwind, slightly behind a competitor. You sail down to leeward and establish an overlap within ' +
      'two hull lengths. Under Rule 11, you have right of way (leeward boat). But under Rule 17, you cannot luff above your proper course. ' +
      'If the proper course is straight to the next mark, you must sail that course and cannot luff to squeeze the windward boat.',
    whenItApplies:
      'When a boat that was clear astern establishes an overlap to leeward within two hull lengths of the other boat, on the same tack. ' +
      'The limitation persists as long as they remain overlapped within that distance.',
    whatToDo:
      'If you are the LEEWARD boat that came from behind: sail your proper course. Do not luff above it. ' +
      'Think about where you would sail if the other boat were not there -- that is your limit.\n' +
      'If you are the WINDWARD boat: know that the leeward boat is limited. If she luffs above proper course, you may have grounds for protest. ' +
      'But you still must keep clear (Rule 11).',
    commonMistakes: [
      'Leeward boat aggressively luffing after sneaking up from behind',
      'Not knowing whether Rule 17 applies -- it depends on HOW the overlap was established',
      'Windward boat assuming Rule 17 always applies (it does not if the overlap was established from more than 2 hull lengths away)',
      'Forgetting that "proper course" is the course you would sail absent the other boat, not necessarily straight at the mark',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 2 - When Boats Meet',
  },
  {
    number: '18',
    title: 'Mark-Room',
    shortText: 'Inside boat at a mark gets room to round',
    fullText:
      'When boats are about to round or pass a mark they are required to leave on the same side, and at least one of them is in the zone: ' +
      '(a) the outside boat shall give mark-room to the inside boat, ' +
      '(b) if the inside boat has right of way, the outside boat shall also keep clear, ' +
      'and (c) a boat that has obtained an inside overlap shall be entitled to mark-room.',
    explanation:
      'Rule 18 is the "big one" -- the most complex and most frequently debated rule in sailing. It governs what happens when boats approach ' +
      'a mark (buoy) that they must round.\n\n' +
      'The key concept is the ZONE: an area around the mark, typically three boat-lengths in radius. When boats enter this zone, ' +
      'special rules apply about who gets room to round the mark.\n\n' +
      'The basic principle: if you are the inside boat (between the mark and the other boat) when you enter the zone, you are entitled to ' +
      '"mark-room" -- enough space to sail to the mark, round it, and sail on your course to the next mark. The outside boat must give you this room.\n\n' +
      'BUT -- and this is crucial -- the overlap must exist when the FIRST boat reaches the zone. If the inside boat establishes an overlap ' +
      'after the first boat enters the zone, she is NOT entitled to mark-room under Rule 18.\n\n' +
      'Mark-room includes room to tack or gybe if that is part of the normal rounding. For example, at a windward mark where you need to ' +
      'bear away, mark-room includes the space to do so.\n\n' +
      'In VR Inshore, mark roundings are where races are won and lost. Understanding Rule 18 is critical.\n\n' +
      'Real-world example: Three boats approach the leeward mark. Boat A is inside, Boat B is in the middle, Boat C is outside. ' +
      'All overlapped before the zone. Boat C must give mark-room to both A and B. Boat B must give mark-room to A. ' +
      'The inside boat (A) rounds first and closest to the mark.',
    whenItApplies:
      'When two or more boats are approaching a mark they must leave on the same side, and at least one of them is within the zone ' +
      '(three boat-lengths from the mark). Does NOT apply at a starting mark before the start, or between boats on opposite tacks on a beat.',
    whatToDo:
      'APPROACHING A MARK: look around early! Determine overlaps BEFORE entering the zone. If you are outside, you must give room. ' +
      'If you are inside, call for room clearly.\n' +
      'If you are OUTSIDE: slow down slightly if needed, give the inside boat space to round. Do not try to squeeze in at the last second.\n' +
      'If you are INSIDE: you are entitled to room, but sail a seamanlike rounding. Do not take more room than you need.\n' +
      'If NOT OVERLAPPED: the boat clear ahead has right of way (Rule 12). The boat behind cannot barge in.',
    commonMistakes: [
      'Trying to establish an inside overlap after the first boat has entered the zone (too late!)',
      'Outside boat squeezing the inside boat into the mark',
      'Inside boat taking wildly excessive room ("swinging wide") beyond what is needed for a proper rounding',
      'Forgetting that Rule 18 does NOT apply between boats on opposite tacks on a beat to windward',
      'Not checking overlaps early enough -- the zone comes up fast',
      'Barging at a windward mark (trying to squeeze between the mark and a leeward boat with no room)',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 2 - When Boats Meet',
  },
  {
    number: '19',
    title: 'Room to Pass an Obstruction',
    shortText: 'Give room to pass an obstruction',
    fullText:
      'When boats are sailing close to an obstruction, a boat that is on the outside (further from the obstruction) shall give room ' +
      'to a boat that is on the inside (closer to the obstruction) to pass safely between them and the obstruction.',
    explanation:
      'An obstruction is anything a boat could not pass without significantly changing course -- another boat racing, a shore, shallow water, ' +
      'a dock, or any other obstacle. When two boats approach an obstruction together, the outside boat must give the inside boat room to pass.\n\n' +
      'This is similar to Rule 18 (mark-room) but for obstructions rather than marks. The key difference is that Rule 19 applies to ALL ' +
      'obstructions, not just marks. A capsized boat, a anchored vessel, or even the shore itself can be an obstruction.\n\n' +
      'The rule also covers the situation where a right-of-way boat is an obstruction to two other boats. For example, if Boat A has right of way ' +
      'over Boat B, and Boat C is sailing next to Boat B, then Boat A is an obstruction to Boat C. Boat B must give Boat C room to pass the ' +
      'obstruction (Boat A).\n\n' +
      'Real-world example: Two boats on the same tack are approaching the shore. The inside boat (closer to shore) needs room to tack. ' +
      'She hails for room to tack. The outside boat must either tack to give room, or hail "you tack" and then give the inside boat room to tack.',
    whenItApplies:
      'When boats are near an obstruction and one boat needs room to pass it safely. Can apply to any obstruction: land, shoals, other boats, ' +
      'docks, moored vessels, etc.',
    whatToDo:
      'If you are OUTSIDE (further from the obstruction): give the inside boat room to pass safely. Slow down, bear away, or otherwise create space.\n' +
      'If you are INSIDE (closer to the obstruction): you are entitled to room, but sail prudently. Do not create the situation deliberately.\n' +
      'If you need room to tack at an obstruction: hail clearly and early. The other boat must respond.',
    commonMistakes: [
      'Outside boat not recognizing that the shore or a moored boat is an obstruction requiring room',
      'Inside boat deliberately creating an overlap at an obstruction to claim room (this can be protested)',
      'Not hailing early enough when room to tack is needed at an obstruction',
      'Confusing Rule 19 with Rule 18 -- Rule 18 is for marks, Rule 19 is for other obstructions',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 2 - When Boats Meet',
  },
  {
    number: '31',
    title: 'Touching a Mark',
    shortText: 'A boat that touches a mark must take a penalty',
    fullText:
      'While racing, a boat shall not touch a starting mark before starting, a mark that begins, bounds or ends the leg of the course ' +
      'on which she is sailing, or a finishing mark after finishing.',
    explanation:
      'This rule is straightforward but has significant consequences. If you touch a mark (buoy), you must take a penalty. ' +
      'In most racing, this means doing a One-Turn Penalty (one tack and one gybe, or a 360-degree turn) as soon as possible after the touch.\n\n' +
      'Touching a mark is very common, especially during tight mark roundings with multiple boats. The penalty is relatively minor -- ' +
      'a 360 turn costs maybe 20-30 seconds. But failing to take the penalty when you touched the mark can result in disqualification.\n\n' +
      'In VR Inshore, the game detects mark touches and applies a penalty timer (visible as the penaltyTimer field). ' +
      'Understanding this rule helps you decide when to risk a tight rounding versus giving the mark more space.\n\n' +
      'Key nuance: you only need to avoid touching marks on YOUR current leg. If you are on leg 2 and accidentally touch a mark for leg 4, ' +
      'there is no penalty. The mark must be one that "begins, bounds, or ends" your current leg.\n\n' +
      'Real-world example: You are rounding the windward mark in a tight pack of boats. The inside boat pushes you wide, and your boom brushes ' +
      'the mark. You must immediately do a 360 penalty turn. If you do it right away, the cost is minimal. If you try to hide it and a competitor ' +
      'sees, you could be protested and disqualified.',
    whenItApplies:
      'Any time a boat (including hull, crew, rigging, or equipment) touches a mark on the current leg of the course. ' +
      'Includes starting marks, rounding marks, and finishing marks.',
    whatToDo:
      'If you TOUCH a mark: take your penalty immediately. The sooner you do it, the less it costs. A quick 360 is much better than a DSQ.\n' +
      'To AVOID touching marks: give marks at least a boat-width of clearance when rounding. Do not cut corners too aggressively. ' +
      'In crowded mark roundings, it is often better to round slightly wide than to risk touching the mark.',
    commonMistakes: [
      'Trying to hide a mark touch instead of taking the penalty',
      'Waiting too long to take the penalty turn, losing even more positions',
      'Cutting mark roundings too tight in an attempt to gain inches',
      'Not realizing that any part of the boat or equipment touching the mark counts (not just the hull)',
      'Forgetting to complete the full penalty turn (tack and gybe, not just spinning)',
    ],
    rrsUrl: 'https://www.sailing.org/inside-world-sailing/rules-regulations/racing-rules-of-sailing/',
    section: 'Part 4 - Other Rules When Racing',
  },
];

/** Map for fast lookup by rule number */
const rulesByNumber = new Map();
for (const rule of rules) {
  rulesByNumber.set(rule.number, rule);
}

/**
 * Get all rules as an array.
 * @returns {Array<object>}
 */
export function getAllRules() {
  return rules;
}

/**
 * Get a specific rule by number.
 * @param {string} number - Rule number (e.g., '10')
 * @returns {object|null}
 */
export function getRule(number) {
  return rulesByNumber.get(String(number)) ?? null;
}

/**
 * Get a random rule for "tip of the day" display.
 * @returns {object}
 */
export function getRandomRule() {
  return rules[Math.floor(Math.random() * rules.length)];
}

export { rules };
