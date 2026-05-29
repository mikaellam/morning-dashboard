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

/**
 * Extract today's timed Google Calendar events from the gcEvents map
 * (keyed by "YYYY-MM-DD" in Helsinki time).
 */
export function getGoogleEventsForDay(gcEvents, dateStr) {
  if (!gcEvents || !dateStr) return [];
  return (gcEvents[dateStr] || []).filter(e => e.time); // skip all-day events in timeline
}

/**
 * Build the full merged + normalised event list for TodayWidget's timeline.
 *
 * @param {object} weekPlan
 * @param {object} recurringEvents
 * @param {string} dayName          Finnish day name ("Maanantai" … "Sunnuntai")
 * @param {object} gcEvents         Map from googleCalendarService.fetchAllEvents()
 * @param {string} todayDateStr     "YYYY-MM-DD" in Helsinki time
 */
export function getEventsForToday(weekPlan, recurringEvents, dayName, gcEvents = {}, todayDateStr = '') {
  const googleEvs = getGoogleEventsForDay(gcEvents, todayDateStr);

  const all = [
    ...getManualEvents(weekPlan, recurringEvents, dayName),
    ...googleEvs,
    ...getOutlookEvents(),
    ...getAppleEvents(),
  ].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  return all.map((e, i) => ({
    id:            e.id            || `ev-${i}-${e.time}`,
    time:          e.time          || '00:00',
    title:         e.title         || '',
    duration:      e.duration      || null,
    category:      e.category      || null,
    source:        e.source        || 'manual',
    recurring:     e.recurring     || false,
    calendarColor: e.calendarColor || null,
    calendarName:  e.calendarName  || null,
    color: e.source === 'google'  ? (e.calendarColor || '#4285f4')
         : e.source === 'outlook' ? '#60a5fa'
         : e.source === 'apple'   ? '#d1d5db'
         :                          '#6ee7b7',
  }));
}
