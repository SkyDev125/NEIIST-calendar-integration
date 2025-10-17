interface Attendee {
    name: string;
    email: string;
}

export interface MeetingStruct {
    date: { start: string; end: string };
    description: string;
    events: string[];
    attendees: Attendee[];
    tags: string[];
    teams: string[];
    location: string[];
    name: string;
    id: string;
}

export interface EventStruct {
    date: { start: string; end: string };
    description: string;
    meetings: string[];
    assignees: Attendee[];
    tags: string[];
    teams: string[];
    location: string[];
    name: string;
    id: string;
}