import { calendar } from '@googleapis/calendar';
import { JWT } from 'google-auth-library';

// Authenticate with service account
const auth = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
});

// Create calendar client with authentication
const calendarClient = calendar({ version: 'v3', auth });

// Create a new calendar with custom hex color
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
                foregroundColor: foregroundColor || '#808080', // Default to black text
            },
        });
    }

    return calendarId;
}

// Example usage:
async function setupCalendars() {
    // Now you can use any hex color!
    const eventsCalendarId = await createCalendar('NEIIST Events', '#BEDAE3');
    const meetingsCalendarId = await createCalendar('NEIIST Meetings', '#C4E9DA');
    console.log('Events Calendar ID:', eventsCalendarId);
    console.log('Meetings Calendar ID:', meetingsCalendarId);
}

setupCalendars();