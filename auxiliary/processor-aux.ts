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