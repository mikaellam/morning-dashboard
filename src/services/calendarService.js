export function getManualEvents(weekPlan, recurringEvents, dayName) {
  const regular   = (weekPlan[dayName]        || []).map(e => ({ ...e, source: 'manual', recurring: false }));
  const recurring = (recurringEvents[dayName] || []).map(e => ({ ...e, source: 'manual', recurring: true  }));
  return [...regular, ...recurring].sort((a, b) => a.time.localeCompare(b.time));
}

export function getOutlookEvents() {
  // TODO: Microsoft Graph API
  return [];
}

export function getAppleEvents() {
  // TODO: iCloud CalDAV or iOS Shortcuts bridge
  return [];
}

export function getEventsForToday(weekPlan, recurringEvents, dayName) {
  const all = [
    ...getManualEvents(weekPlan, recurringEvents, dayName),
    ...getOutlookEvents(),
    ...getAppleEvents(),
  ].sort((a, b) => a.time.localeCompare(b.time));

  return all.map((e, i) => ({
    id:        e.id        || `ev-${i}-${e.time}`,
    time:      e.time      || "00:00",
    title:     e.title     || "",
    duration:  e.duration  || null,
    category:  e.category  || null,
    source:    e.source    || 'manual',
    recurring: e.recurring || false,
    color: e.source === 'outlook' ? '#60a5fa'
         : e.source === 'apple'   ? '#d1d5db'
         :                          '#6ee7b7',
  }));
}
