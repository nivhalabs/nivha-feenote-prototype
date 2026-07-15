/* Acuity Scheduling — live availability and appointment creation for the
 * Belfast calendar. Derry~Londonderry and on-site collections are handled
 * as requests, not calendar bookings.
 *
 * Runs simulated until ACUITY_USER_ID and ACUITY_API_KEY are configured,
 * so the prototype keeps working without keys. */
'use strict';

const USER_ID = process.env.ACUITY_USER_ID || '';
const API_KEY = process.env.ACUITY_API_KEY || '';
const TYPE_BELFAST = process.env.ACUITY_TYPE_BELFAST || '';
const SIMULATED = !(USER_ID && API_KEY);
const BASE = 'https://acuityscheduling.com/api/v1';

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${USER_ID}:${API_KEY}`).toString('base64'),
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Acuity ${res.status}: ${(data && (data.message || data.error)) || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* All active appointment types — used once to find the Belfast type ID. */
const getTypes = () => api('GET', '/appointment-types');

/* Staff/room calendars — used once during setup to see which calendar
 * each appointment type runs on. */
const getCalendars = () => api('GET', '/calendars');

/* Dates with availability in a month: [{ date: 'YYYY-MM-DD' }] */
const getDates = (month, typeId = TYPE_BELFAST) =>
  api('GET', `/availability/dates?month=${encodeURIComponent(month)}&appointmentTypeID=${encodeURIComponent(typeId)}`);

/* Times for a date: [{ time: '2026-07-21T09:00:00+0100' }] */
const getTimes = (date, typeId = TYPE_BELFAST) =>
  api('GET', `/availability/times?date=${encodeURIComponent(date)}&appointmentTypeID=${encodeURIComponent(typeId)}`);

const createAppointment = ({ datetime, firstName, lastName, email, phone, notes, typeId = TYPE_BELFAST }) =>
  api('POST', '/appointments', {
    datetime,
    appointmentTypeID: Number(typeId),
    firstName, lastName, email,
    phone: phone || '',
    notes: notes || ''
  });

module.exports = { SIMULATED, TYPE_BELFAST, getTypes, getCalendars, getDates, getTimes, createAppointment };
