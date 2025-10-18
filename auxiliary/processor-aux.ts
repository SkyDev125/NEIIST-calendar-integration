import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

const notion = new Client({
    auth: process.env.NOTION_TOKEN,
})

async function getTitleFromPage(pageId: string, property: string = "name"): Promise<string> {
    if (!pageId) return "Unknown";

    const page = await notion.pages.retrieve({ page_id: pageId });

    if (!("properties" in page)) {
        return "Unknown";
    }

    const properties = (page as PageObjectResponse).properties;
    const prop = properties[property];

    if (prop && prop.type === "title" && prop.title[0]?.type === "text") {
        return prop.title[0].text.content || `Unknown ${property}`;
    }

    return `Unknown ${property}`;
}

async function getPersonFromPage(pageId: string): Promise<{ name: string; email: string }> {
    if (!pageId) return { name: "Unknown", email: "" };

    const page = await notion.pages.retrieve({ page_id: pageId });

    if (!("properties" in page)) {
        return { name: "Unknown", email: "" };
    }

    const properties = (page as PageObjectResponse).properties;

    const nameProp = properties.name;
    const emailProp = properties.email;

    const name = nameProp && nameProp.type === "title" && nameProp.title[0]?.type === "text"
        ? nameProp.title[0].text.content || "Unknown Attendee"
        : "Unknown Attendee";

    const email = emailProp && emailProp.type === "email"
        ? emailProp.email || ""
        : "";

    return { name, email };
}

export async function mapRelationToTitles(rel: { relation: { id: string }[] }, property: string = "name"): Promise<string[]> {
    return Promise.all(rel.relation.map(item => getTitleFromPage(item.id, property)));
}

export async function mapRelationToPeople(rel: { relation: { id: string }[] }): Promise<{ name: string; email: string }[]> {
    return Promise.all(rel.relation.map(item => getPersonFromPage(item.id)));
}

export async function createPage(
    properties: PageObjectResponse["properties"] & {
        id: { type: "unique_id"; unique_id: { prefix: string; number: number } }
    }
): Promise<string> {
    const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE;
    if (!NOTION_DATA_SOURCE_ID) {
        throw new Error("[processor] NOTION_DATA_SOURCE not defined in environment");
    }

    const sourceValue = `${properties.id.unique_id.prefix}-${properties.id.unique_id.number}`;

    // Try to locate an existing page by the stable "source" key
    const query = await notion.dataSources.query({
        data_source_id: NOTION_DATA_SOURCE_ID,
        filter: {
            property: "source",
            rich_text: { equals: sourceValue },
        },
    });
    const existingId = query.results[0]?.id as string | undefined;

    // Build the target properties object using known fields present in our schema
    const outProps: Record<string, any> = {};
    if ("name" in properties) outProps.name = { title: (properties as any).name?.title };
    if ("description" in properties) outProps.description = { rich_text: (properties as any).description?.rich_text };
    if ("date" in properties) outProps.date = { date: (properties as any).date?.date };
    if ("assignees" in properties) outProps.assignees = { relation: (properties as any).assignees?.relation };
    if ("attendees" in properties) outProps.attendees = { relation: (properties as any).attendees?.relation };
    if ("location" in properties) outProps.location = { relation: (properties as any).location?.relation };
    if ("meetings" in properties) outProps.meetings = { relation: (properties as any).meetings?.relation };
    if ("events" in properties) outProps.events = { relation: (properties as any).events?.relation };
    if ("tags" in properties) outProps.tags = { relation: (properties as any).tags?.relation };
    if ("teams" in properties) outProps.teams = { relation: (properties as any).teams?.relation };

    if (existingId) {
        // Update page with new info
        const res = await notion.pages.update({
            page_id: existingId,
            properties: outProps,
        });
        return res.id;
    }

    // Create new data source entry with info
    const res = await notion.pages.create({
        parent: { data_source_id: NOTION_DATA_SOURCE_ID },
        properties: {
            ...outProps,
            source: { rich_text: [{ type: "text", text: { content: sourceValue } }] },
        },
    });
    return res.id;
}