// Processor worker - receives webhook payloads and processes them
import type { MeetingStruct, EventStruct } from "./interfaces";
import { mapRelationToTitles, mapRelationToPeople } from "./processor-aux";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import "dotenv/config";
import { createEvent, createMeeting } from "./calendar";

declare var self: Worker;

const notion = new Client({
    auth: process.env.NOTION_TOKEN,
});

function getName(prop: any, defaultName: string = "No Title"): string {
    if (prop && prop.type === "title" && prop.title[0]?.type === "text") {
        return prop.title[0].text.content || defaultName;
    }
    return defaultName;
}

function getDescription(prop: any): string {
    if (prop && prop.type === "rich_text" && prop.rich_text[0]?.type === "text") {
        return prop.rich_text[0].text.content || "";
    }
    return "";
}

function getDate(prop: any): { start: string; end: string } {
    if (prop && prop.type === "date" && prop.date) {
        return {
            start: prop.date.start,
            end: prop.date.end || prop.date.start,
        };
    }
    return { start: "", end: "" };
}

async function process_meeting(
    properties: PageObjectResponse["properties"] & { id: { type: "unique_id"; unique_id: { prefix: string; number: number } } }
) {
    console.log("Processing Meeting with ID:", properties.id);

    let meeting: Partial<MeetingStruct> = {
        name: getName(properties.name),
        description: getDescription(properties.description),
        date: getDate(properties.date),
        id: properties.id.unique_id.prefix + properties.id.unique_id.number,
    }

    // ----------------------- Notion -------------------------

    // Prepare all property fetch promises in parallel
    const promises: Promise<void>[] = [];

    const location = properties.location;
    if (location && location.type === "relation") {
        promises.push(
            mapRelationToTitles(location).then(result => { meeting.location = result; })
        );
    }

    const attendees = properties.attendees;
    if (attendees && attendees.type === "relation") {
        promises.push(
            mapRelationToPeople(attendees).then(result => { meeting.attendees = result; })
        );
    }

    const tags = properties.tags;
    if (tags && tags.type === "relation") {
        promises.push(
            mapRelationToTitles(tags).then(result => { meeting.tags = result; })
        );
    }

    const teams = properties.teams;
    if (teams && teams.type === "relation") {
        promises.push(
            mapRelationToTitles(teams).then(result => { meeting.teams = result; })
        );
    }

    const events = properties.events;
    if (events && events.type === "relation") {
        promises.push(
            mapRelationToTitles(events).then(result => { meeting.events = result; })
        );
    }

    await Promise.all(promises);

    console.log("Meeting details:", meeting);

    // ------------------- Google Calendar --------------------

    await createMeeting(meeting as MeetingStruct);

    console.log("Meeting created in Google Calendar");
}

async function process_event(properties: PageObjectResponse["properties"] & { id: { type: "unique_id"; unique_id: { prefix: string; number: number } } }) {
    console.log("Processing Event with ID:", properties.id);

    let event: Partial<EventStruct> = {
        name: getName(properties.name),
        description: getDescription(properties.description),
        date: getDate(properties.date),
        id: properties.id.unique_id.prefix + properties.id.unique_id.number,
    }

    // Prepare all property fetch promises in parallel
    const promises: Promise<void>[] = [];

    const location = properties.location;
    if (location && location.type === "relation") {
        promises.push(
            mapRelationToTitles(location).then(result => { event.location = result; })
        );
    }

    const assignees = properties.assignees;
    if (assignees && assignees.type === "relation") {
        promises.push(
            mapRelationToPeople(assignees).then(result => { event.assignees = result; })
        );
    }

    const tags = properties.tags;
    if (tags && tags.type === "relation") {
        promises.push(
            mapRelationToTitles(tags).then(result => { event.tags = result; })
        );
    }

    const teams = properties.teams;
    if (teams && teams.type === "relation") {
        promises.push(
            mapRelationToTitles(teams).then(result => { event.teams = result; })
        );
    }

    const meetings = properties.meetings;
    if (meetings && meetings.type === "relation") {
        promises.push(
            mapRelationToTitles(meetings).then(result => { event.meetings = result; })
        );
    }

    await Promise.all(promises);

    console.log("Event details:", event);

    // ------------------- Google Calendar --------------------

    await createEvent(event as EventStruct);

    console.log("Event created in Google Calendar");
}

self.addEventListener("message", async (event: MessageEvent) => {
    const { payload, receivedAt } = event.data;
    console.log("[processor] received at:", new Date(receivedAt).toISOString());

    try {
        // Extract the page ID from the webhook payload
        const pageId = payload.data.id;

        // Fetch the page to get the unique_id prefix
        const page = await notion.pages.retrieve({ page_id: pageId });

        if (!("properties" in page)) {
            throw new Error("Page does not have properties");
        }

        let properties = (page as PageObjectResponse).properties;
        const id = properties.id;

        if (!id || id.type !== "unique_id" || !id.unique_id) {
            throw new Error("Page does not have a valid unique_id property");
        }

        const safeProperties = properties as typeof properties & {
            id: { type: "unique_id"; unique_id: { prefix: string; number: number } }
        };

        const prefix = id.unique_id.prefix;

        switch (prefix) {
            case "ME":
                await process_meeting(safeProperties);
                break;
            case "EV":
                await process_event(safeProperties);
                break;
            default:
                throw new Error("Unknown prefix: " + prefix);
        }
    } catch (err) {
        console.error("[processor] Notion error:", err);
    }
});

console.log("[processor] worker started");
