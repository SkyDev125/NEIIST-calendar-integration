import { calendar } from '@googleapis/calendar';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import type { EventStruct, MeetingStruct } from './interfaces';

// Authenticate with service account
const auth = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendarClient = calendar({ version: 'v3', auth });
let eventsCalendarId = process.env.NEIIST_EVENTS_CALENDAR_ID;
let meetingsCalendarId = process.env.NEIIST_MEETINGS_CALENDAR_ID;

// Helper to append or update .env file
function updateEnvFile(key: string, value: string) {
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';

    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
    }

    // Check if key already exists
    const lines = envContent.split(/\r?\n/);
    let keyExists = false;

    const updatedLines = lines.map(line => {
        if (line.startsWith(`${key}=`)) {
            keyExists = true;
            return `${key}=${value}`;
        }
        return line;
    });

    // If key doesn't exist, add it
    if (!keyExists) {
        updatedLines.push(`${key}=${value}`);
    }

    fs.writeFileSync(envPath, updatedLines.join('\n'));
}

// Check if an event with this ID already exists
async function eventExists(eventId: string): Promise<string | null> {
    try {
        const res = await calendarClient.events.list({
            calendarId: eventsCalendarId,
            q: `id: ${eventId}`, // Search in description
            maxResults: 100,
        });

        // Check if any event's description contains this ID
        const existingEvent = res.data.items?.find(item =>
            item.description?.includes(`id: ${eventId}`)
        );

        return existingEvent?.id || null;
    } catch (err: any) {
        console.error('[calendar] Error checking event existence:', err.message);
        return null;
    }
}

export async function createEvent(event: EventStruct) {
    function getDateField(dateStr: string, isEnd = false) {
        if (dateStr.includes('T')) {
            return { dateTime: dateStr };
        } else {
            // For end date, add one day (exclusive end)
            if (isEnd) {
                const d = new Date(dateStr);
                d.setDate(d.getDate() + 1);
                const plusOne = d.toISOString().slice(0, 10);
                return { date: plusOne };
            }
            return { date: dateStr };
        }
    }
    const eventData = {
        start: getDateField(event.date.start),
        end: getDateField(event.date.end, true),
        summary: event.name,
        // attendees: event.assignees
        //     .filter(assignee => assignee.email && assignee.email.trim() !== '')
        //     .map(assignee => ({
        //         displayName: assignee.name,
        //         email: assignee.email,
        //     })),
        description: `
${event.description}

Related Meetings:
${event.meetings.join('\n')}

Tags: 
${event.tags.join(', ')}

Teams:
${event.teams.join(', ')}

Assignees:
${event.assignees.map(a => a.name).join(', ')}

id: ${event.id}
`,
        location: event.location.join(', '),
    };

    // Check if event already exists
    const existingEventId = await eventExists(event.id);
    if (existingEventId) {
        console.log(`[calendar] Event ${event.id} already exists, updating...`);
        const res = await calendarClient.events.update({
            calendarId: eventsCalendarId,
            eventId: existingEventId,
            requestBody: eventData,
        });
        return res.data.id;
    }

    // Create new event
    const res = await calendarClient.events.insert({
        calendarId: eventsCalendarId,
        requestBody: eventData,
    });

    return res.data.id;
}

// Check if a meeting with this ID already exists
async function meetingExists(meetingId: string): Promise<string | null> {
    try {
        const res = await calendarClient.events.list({
            calendarId: meetingsCalendarId,
            q: `id: ${meetingId}`, // Search in description
            maxResults: 100,
        });

        // Check if any event's description contains this ID
        const existingMeeting = res.data.items?.find(item =>
            item.description?.includes(`id: ${meetingId}`)
        );

        return existingMeeting?.id || null;
    } catch (err: any) {
        console.error('[calendar] Error checking meeting existence:', err.message);
        return null;
    }
}

export async function createMeeting(meeting: MeetingStruct) {
    function getDateField(dateStr: string, isEnd = false) {
        if (dateStr.includes('T')) {
            return { dateTime: dateStr };
        } else {
            // For end date, add one day (exclusive end)
            if (isEnd) {
                const d = new Date(dateStr);
                d.setDate(d.getDate() + 1);
                const plusOne = d.toISOString().slice(0, 10);
                return { date: plusOne };
            }
            return { date: dateStr };
        }
    }
    const meetingData = {
        start: getDateField(meeting.date.start),
        end: getDateField(meeting.date.end, true),
        summary: meeting.name,
        // attendees: meeting.attendees
        //     .filter(attendee => attendee.email && attendee.email.trim() !== '')
        //     .map(attendee => ({
        //         displayName: attendee.name,
        //         email: attendee.email,
        //     })),
        location: meeting.location.join(', '),
        description: `
${meeting.description}

Related Events:
${meeting.events.join('\n')}

Tags:
${meeting.tags.join(', ')}

Teams:
${meeting.teams.join(', ')}

Attendees:
${meeting.attendees.map(a => a.name).join(', ')}

id: ${meeting.id}
`,
    };

    // Check if meeting already exists
    const existingMeetingId = await meetingExists(meeting.id);
    if (existingMeetingId) {
        console.log(`[calendar] Meeting ${meeting.id} already exists, updating...`);
        const res = await calendarClient.events.update({
            calendarId: meetingsCalendarId,
            eventId: existingMeetingId,
            requestBody: meetingData,
        });
        return res.data.id;
    }

    // Create new meeting
    const res = await calendarClient.events.insert({
        calendarId: meetingsCalendarId,
        requestBody: meetingData,
    });

    return res.data.id;
}

async function createCalendar(summary: string, backgroundColor?: string, foregroundColor?: string) {
    const res = await calendarClient.calendars.insert({ requestBody: { summary } });
    const calendarId = res.data.id;

    // Update calendar with custom hex colors if provided
    if (calendarId && backgroundColor) {
        await calendarClient.calendarList.update({
            calendarId,
            colorRgbFormat: true,
            requestBody: {
                backgroundColor,
                foregroundColor: foregroundColor || '#000000',
            },
        });
    }

    return calendarId;
}

async function calendarExists(calendarId: string): Promise<boolean> {
    try {
        const res = await calendarClient.calendars.get({ calendarId });
        return !!res.data.id;
    } catch (err: any) {
        if (err.code === 404) return false;
        throw err;
    }
}


// Get current ACL emails for a calendar
async function getCalendarAclEmails(calendarId: string): Promise<{ [email: string]: string }> {
    const res = await calendarClient.acl.list({ calendarId });
    const acl = res.data.items || [];
    // Return a map of email to ruleId for user-type rules only
    const emailMap: { [email: string]: string } = {};
    for (const rule of acl) {
        if (rule.scope?.type === 'user' && rule.scope.value) {
            emailMap[rule.scope.value] = rule.id!;
        }
    }
    return emailMap;
}

// Sync calendar sharing with a list of emails
async function syncCalendarSharing(calendarId: string, emails: string[], role: 'reader' | 'writer' | 'owner' = 'reader') {
    const currentAcl = await getCalendarAclEmails(calendarId);

    const serviceAccountEmail = (process.env.GOOGLE_CLIENT_EMAIL || '').toLowerCase();
    const protectedEmails = new Set<string>([calendarId.toLowerCase(), serviceAccountEmail].filter(Boolean));

    // Normalize desired emails, skip protected identities if accidentally listed
    const emailsSet = new Set(
        emails
            .map(e => e.trim())
            .filter(Boolean)
            .filter(e => !protectedEmails.has(e.toLowerCase()))
    );
    const currentEmailsSet = new Set(Object.keys(currentAcl));

    // Add new emails
    for (const email of emailsSet) {
        if (!currentEmailsSet.has(email)) {
            try {
                await calendarClient.acl.insert({
                    calendarId,
                    requestBody: {
                        scope: { type: 'user', value: email },
                        role,
                    },
                });
                console.log(`[calendar] Shared calendar ${calendarId} with ${email} as ${role}`);
            } catch (err: any) {
                console.error(`[calendar] Failed to share calendar with ${email}:`, err.message);
            }
        }
    }

    // Remove emails no longer in the list (but never try to remove protected identities)
    for (const email of currentEmailsSet) {
        if (protectedEmails.has(email.toLowerCase())) {
            continue; // Skip calendar primary owner and service account
        }
        if (!emailsSet.has(email)) {
            try {
                await calendarClient.acl.delete({
                    calendarId,
                    ruleId: currentAcl[email],
                });
                console.log(`[calendar] Removed calendar access for ${email}`);
            } catch (err: any) {
                console.error(`[calendar] Failed to remove calendar access for ${email}:`, err.message);
            }
        }
    }
}


async function setupCalendars() {
    // Check if calendars exist
    if (eventsCalendarId && !(await calendarExists(eventsCalendarId))) {
        eventsCalendarId = undefined;
    }
    if (meetingsCalendarId && !(await calendarExists(meetingsCalendarId))) {
        meetingsCalendarId = undefined;
    }

    // Create if missing
    if (!eventsCalendarId) {
        const newId = await createCalendar('NEIIST Events', '#BEDAE3');
        if (newId) {
            eventsCalendarId = newId;
            updateEnvFile('NEIIST_EVENTS_CALENDAR_ID', eventsCalendarId);
            console.log('[calendar]: Created Events Calendar and saved to .env:', eventsCalendarId);
        } else {
            throw new Error('[calendar] Failed to create Events Calendar');
        }
    }
    if (!meetingsCalendarId) {
        const newId = await createCalendar('NEIIST Meetings', '#C4E9DA');
        if (newId) {
            meetingsCalendarId = newId;
            updateEnvFile('NEIIST_MEETINGS_CALENDAR_ID', meetingsCalendarId);
            console.log('[calendar] Created Meetings Calendar and saved to .env:', meetingsCalendarId);
        } else {
            throw new Error('[calendar] Failed to create Meetings Calendar');
        }
    }

    // Parse comma-separated emails from .env
    const shareList = (process.env.NEIIST_CALENDAR_SHARE_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

    await syncCalendarSharing(eventsCalendarId, shareList, 'reader');
    await syncCalendarSharing(meetingsCalendarId, shareList, 'reader');


    console.log('[calendar] Events Calendar ID:', eventsCalendarId);
    console.log('[calendar] Meetings Calendar ID:', meetingsCalendarId);
}

setupCalendars();