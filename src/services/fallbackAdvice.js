/**
 * Deterministic, rule-based advice used when Gemini is unavailable (no key, quota, timeout).
 * Guarantees the app always returns useful, safe guidance with the same response shape.
 */

const fmtHour = (iso) => (iso ? iso.slice(11, 16) : null);

export function buildFallbackAdvice(air, profile) {
  const level = air.category.level;
  const high = ['poor', 'very_poor', 'severe'].includes(level);
  const sensitive = profile.sensitiveGroups.length > 0;
  const best = air.bestOutdoorWindow;
  const worst = air.worstWindow;

  const routine = [
    {
      time: best ? `${fmtHour(best.start)}–${fmtHour(best.end)}` : 'Midday',
      activity: high ? 'Keep outdoor errands short and do them now' : 'Walk, exercise or run errands outdoors',
      why: best ? `PM2.5 is forecast to be lowest (~${best.avgPm25} µg/m³) in this window.` : 'Air usually mixes best around midday.',
      impact: 'Shifting outdoor time to the cleanest window can cut the PM2.5 you inhale by a third or more compared with peak hours.',
    },
    {
      time: worst ? `${fmtHour(worst.start)}–${fmtHour(worst.end)}` : 'Early morning & late evening',
      activity: 'Stay indoors with windows closed',
      why: worst ? `This is the most polluted window (~${worst.avgPm25} µg/m³).` : 'Winter inversions trap smog near the ground at these times.',
      impact: 'Avoiding the worst hours prevents the highest single dose of fine particles of the day.',
    },
  ];

  if (profile.commute === 'car' || profile.commute === 'two_wheeler') {
    routine.push({
      time: 'Commute',
      activity: 'Carpool or take the metro/bus once this week',
      why: 'Fewer private vehicles is the fastest way a household lowers its own NO₂ and PM emissions.',
      impact: 'A 15 km car commute by metro instead avoids roughly 2–3 kg of CO₂ and local exhaust each day.',
    });
  }

  const indoorTips = [
    {
      tip: profile.hasAirPurifier ? 'Run the purifier on high in the bedroom with door closed' : 'Make a DIY box-fan filter (MERV-13 filter taped to a box fan)',
      impact: 'A sealed room with filtration can bring indoor PM2.5 down by 50–80%.',
      cost: profile.hasAirPurifier ? 'Free (already owned)' : '≈ ₹1,500–2,500',
    },
    {
      tip: 'Seal window gaps with weather strips and keep doors shut on high-smog days',
      impact: 'Reduces infiltration of outdoor smog, keeping indoor air cleaner for longer.',
      cost: '≈ ₹200–500',
    },
    {
      tip: 'Use the kitchen chimney/exhaust while cooking and avoid incense, mosquito coils and candles',
      impact: 'Cooking and burning are among the largest indoor PM2.5 sources.',
      cost: 'Free',
    },
    {
      tip: 'Damp-mop floors instead of sweeping',
      impact: 'Stops settled dust from being thrown back into the air you breathe.',
      cost: 'Free',
    },
  ];

  const alternatives = [];
  if (profile.heating === 'coal_or_wood') {
    alternatives.push({ instead: 'Coal or wood angithi for warmth', tryThis: 'Oil-filled electric radiator + warm layers', impact: 'Removes a major indoor PM2.5 and carbon-monoxide source; safer for children.' });
  }
  if (profile.cookingFuel === 'biomass' || profile.cookingFuel === 'kerosene') {
    alternatives.push({ instead: 'Biomass/kerosene cooking', tryThis: 'LPG (PMUY scheme) or induction cooktop', impact: 'Cuts household smoke exposure dramatically.' });
  }
  alternatives.push(
    { instead: 'Burning dry leaves or garbage', tryThis: 'Compost or hand over to the municipal waste collector', impact: 'Open burning is a large local winter PM2.5 source.' },
    { instead: 'Firecrackers at celebrations', tryThis: 'Lights, music or community events', impact: 'Avoids sharp PM2.5 spikes that can last for days in winter.' },
  );

  const healthAlerts = [];
  if (high) healthAlerts.push('Wear a well-fitted N95/FFP2 mask outdoors; cloth and surgical masks do not filter fine particles.');
  if (high && sensitive) healthAlerts.push('Sensitive members of your household should avoid outdoor exertion today and keep any prescribed inhalers handy.');

  return {
    summary: `Air in ${air.place.name} is ${air.category.label.toLowerCase()} right now (PM2.5 ${air.pollutants.pm2_5 ?? 'n/a'} µg/m³). ${air.category.advice}`,
    riskLevel: air.category.level,
    routine,
    indoorTips,
    alternatives,
    healthAlerts,
    generatedBy: 'rules',
  };
}

export function buildFallbackAnswer(air) {
  return `I can't reach the AI model right now, but here's what the data says: air in ${air.place.name} is ${air.category.label.toLowerCase()} (PM2.5 ${air.pollutants.pm2_5 ?? 'n/a'} µg/m³). ${air.category.advice} Keep windows closed during the worst hours, filter indoor air and wear an N95 outdoors if levels are poor or worse.`;
}
