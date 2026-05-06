import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { IntercomApiError, type IntercomClient } from "./intercom.js";

function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown): CallToolResult {
  const message =
    err instanceof IntercomApiError
      ? `${err.status} ${err.statusText}: ${typeof err.body === "string" ? err.body : JSON.stringify(err.body)}`
      : err instanceof Error
        ? err.message
        : String(err);
  return { isError: true, content: [{ type: "text", text: message }] };
}

async function run<T>(fn: () => Promise<T>): Promise<CallToolResult> {
  try {
    return jsonResult(await fn());
  } catch (err) {
    return errorResult(err);
  }
}

const pagination = {
  per_page: z.number().int().min(1).max(150).optional().describe("Results per page (max 150)"),
  starting_after: z.string().optional().describe("Cursor returned by a previous list call"),
};

export function registerIntercomTools(server: McpServer, intercom: IntercomClient): void {
  // ── Identity ────────────────────────────────────────────────────────────────
  server.registerTool(
    "intercom_me",
    {
      title: "Get current admin",
      description: "Returns the admin associated with the current access token.",
      inputSchema: {},
    },
    async () => run(() => intercom.request({ path: "/me" })),
  );

  // ── Admins ──────────────────────────────────────────────────────────────────
  server.registerTool(
    "intercom_list_admins",
    {
      title: "List admins",
      description: "List all admins in the workspace.",
      inputSchema: {},
    },
    async () => run(() => intercom.request({ path: "/admins" })),
  );

  server.registerTool(
    "intercom_get_admin",
    {
      title: "Get admin",
      description: "Get a single admin by id.",
      inputSchema: { admin_id: z.string().describe("Intercom admin id") },
    },
    async ({ admin_id }) => run(() => intercom.request({ path: `/admins/${encodeURIComponent(admin_id)}` })),
  );

  // ── Contacts ────────────────────────────────────────────────────────────────
  server.registerTool(
    "intercom_list_contacts",
    {
      title: "List contacts",
      description: "List contacts (users and leads) in the workspace.",
      inputSchema: pagination,
    },
    async ({ per_page, starting_after }) =>
      run(() => intercom.request({ path: "/contacts", query: { per_page, starting_after } })),
  );

  server.registerTool(
    "intercom_get_contact",
    {
      title: "Get contact",
      description: "Get a single contact by Intercom id.",
      inputSchema: { contact_id: z.string().describe("Intercom contact id") },
    },
    async ({ contact_id }) =>
      run(() => intercom.request({ path: `/contacts/${encodeURIComponent(contact_id)}` })),
  );

  server.registerTool(
    "intercom_search_contacts",
    {
      title: "Search contacts",
      description:
        "Search contacts using Intercom's search query DSL. Pass a `query` object with operators like `{ field, operator, value }` or `{ operator: 'AND'|'OR', value: [...] }`.",
      inputSchema: {
        query: z
          .record(z.any())
          .describe("Intercom search query object (see Intercom docs for the operator grammar)"),
        pagination: z
          .object({ per_page: z.number().int().optional(), starting_after: z.string().optional() })
          .optional(),
      },
    },
    async ({ query, pagination }) =>
      run(() =>
        intercom.request({
          method: "POST",
          path: "/contacts/search",
          body: { query, ...(pagination ? { pagination } : {}) },
        }),
      ),
  );

  server.registerTool(
    "intercom_create_contact",
    {
      title: "Create contact",
      description: "Create a new contact (user or lead).",
      inputSchema: {
        role: z.enum(["user", "lead"]).optional().describe("Defaults to lead if omitted"),
        external_id: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        name: z.string().optional(),
        custom_attributes: z.record(z.any()).optional(),
        signed_up_at: z.number().int().optional(),
        last_seen_at: z.number().int().optional(),
        owner_id: z.number().int().optional(),
        unsubscribed_from_emails: z.boolean().optional(),
      },
    },
    async (args) => run(() => intercom.request({ method: "POST", path: "/contacts", body: args })),
  );

  server.registerTool(
    "intercom_update_contact",
    {
      title: "Update contact",
      description: "Update an existing contact by id.",
      inputSchema: {
        contact_id: z.string().describe("Intercom contact id"),
        patch: z.record(z.any()).describe("Fields to update on the contact"),
      },
    },
    async ({ contact_id, patch }) =>
      run(() =>
        intercom.request({
          method: "PUT",
          path: `/contacts/${encodeURIComponent(contact_id)}`,
          body: patch,
        }),
      ),
  );

  server.registerTool(
    "intercom_delete_contact",
    {
      title: "Delete contact",
      description: "Permanently delete a contact by id.",
      inputSchema: { contact_id: z.string() },
    },
    async ({ contact_id }) =>
      run(() =>
        intercom.request({ method: "DELETE", path: `/contacts/${encodeURIComponent(contact_id)}` }),
      ),
  );

  server.registerTool(
    "intercom_archive_contact",
    {
      title: "Archive contact",
      description: "Archive a contact by id.",
      inputSchema: { contact_id: z.string() },
    },
    async ({ contact_id }) =>
      run(() =>
        intercom.request({
          method: "POST",
          path: `/contacts/${encodeURIComponent(contact_id)}/archive`,
        }),
      ),
  );

  server.registerTool(
    "intercom_add_contact_note",
    {
      title: "Add note to contact",
      description: "Attach an internal note to a contact.",
      inputSchema: {
        contact_id: z.string(),
        body: z.string().describe("Note body (HTML allowed)"),
        admin_id: z.string().optional().describe("Author admin id"),
      },
    },
    async ({ contact_id, body, admin_id }) =>
      run(() =>
        intercom.request({
          method: "POST",
          path: `/contacts/${encodeURIComponent(contact_id)}/notes`,
          body: { body, ...(admin_id ? { admin_id } : {}) },
        }),
      ),
  );

  // ── Conversations ───────────────────────────────────────────────────────────
  server.registerTool(
    "intercom_list_conversations",
    {
      title: "List conversations",
      description: "List conversations in the workspace.",
      inputSchema: pagination,
    },
    async ({ per_page, starting_after }) =>
      run(() => intercom.request({ path: "/conversations", query: { per_page, starting_after } })),
  );

  server.registerTool(
    "intercom_get_conversation",
    {
      title: "Get conversation",
      description: "Get a single conversation by id, including its message thread.",
      inputSchema: {
        conversation_id: z.string(),
        display_as: z.enum(["plaintext"]).optional().describe("Set to 'plaintext' to strip HTML"),
      },
    },
    async ({ conversation_id, display_as }) =>
      run(() =>
        intercom.request({
          path: `/conversations/${encodeURIComponent(conversation_id)}`,
          query: { display_as },
        }),
      ),
  );

  server.registerTool(
    "intercom_search_conversations",
    {
      title: "Search conversations",
      description: "Search conversations using Intercom's search query DSL.",
      inputSchema: {
        query: z.record(z.any()),
        pagination: z
          .object({ per_page: z.number().int().optional(), starting_after: z.string().optional() })
          .optional(),
      },
    },
    async ({ query, pagination }) =>
      run(() =>
        intercom.request({
          method: "POST",
          path: "/conversations/search",
          body: { query, ...(pagination ? { pagination } : {}) },
        }),
      ),
  );

  server.registerTool(
    "intercom_create_conversation",
    {
      title: "Create conversation",
      description: "Create a new conversation from a user or lead.",
      inputSchema: {
        from: z
          .object({
            type: z.enum(["user", "lead", "contact"]),
            id: z.string().optional(),
            user_id: z.string().optional(),
            email: z.string().optional(),
          })
          .describe("Sender of the conversation"),
        body: z.string().describe("Message body (HTML allowed)"),
      },
    },
    async (args) => run(() => intercom.request({ method: "POST", path: "/conversations", body: args })),
  );

  server.registerTool(
    "intercom_reply_conversation",
    {
      title: "Reply to conversation",
      description: "Send a reply, note, or close a conversation.",
      inputSchema: {
        conversation_id: z.string(),
        message_type: z
          .enum(["comment", "note", "quick_reply", "close", "open", "snoozed", "away_mode_assignment"])
          .describe("Type of reply event"),
        type: z
          .enum(["admin", "user"])
          .describe("Who is replying — usually 'admin' for outbound, 'user' for inbound"),
        admin_id: z.string().optional().describe("Required when type is 'admin'"),
        intercom_user_id: z.string().optional(),
        user_id: z.string().optional(),
        email: z.string().optional(),
        body: z.string().optional().describe("Reply body (HTML allowed)"),
        attachment_urls: z.array(z.string()).optional(),
      },
    },
    async ({ conversation_id, ...rest }) =>
      run(() =>
        intercom.request({
          method: "POST",
          path: `/conversations/${encodeURIComponent(conversation_id)}/reply`,
          body: rest,
        }),
      ),
  );

  server.registerTool(
    "intercom_assign_conversation",
    {
      title: "Assign conversation",
      description: "Assign a conversation to an admin or team.",
      inputSchema: {
        conversation_id: z.string(),
        admin_id: z.string().describe("Acting admin id (the one performing the assign)"),
        assignee_id: z.string().describe("Target admin or team id (use '0' to unassign)"),
        type: z.enum(["admin", "team"]).default("admin").describe("Assignment target type"),
        body: z.string().optional(),
      },
    },
    async ({ conversation_id, admin_id, assignee_id, type, body }) =>
      run(() =>
        intercom.request({
          method: "POST",
          path: `/conversations/${encodeURIComponent(conversation_id)}/parts`,
          body: {
            message_type: "assignment",
            admin_id,
            assignee_id,
            type,
            ...(body ? { body } : {}),
          },
        }),
      ),
  );

  server.registerTool(
    "intercom_close_conversation",
    {
      title: "Close conversation",
      description: "Close a conversation as an admin.",
      inputSchema: {
        conversation_id: z.string(),
        admin_id: z.string(),
        body: z.string().optional().describe("Optional closing note (HTML allowed)"),
      },
    },
    async ({ conversation_id, admin_id, body }) =>
      run(() =>
        intercom.request({
          method: "POST",
          path: `/conversations/${encodeURIComponent(conversation_id)}/parts`,
          body: { message_type: "close", type: "admin", admin_id, ...(body ? { body } : {}) },
        }),
      ),
  );

  // ── Companies ───────────────────────────────────────────────────────────────
  server.registerTool(
    "intercom_list_companies",
    {
      title: "List companies",
      description: "List companies in the workspace.",
      inputSchema: pagination,
    },
    async ({ per_page, starting_after }) =>
      run(() => intercom.request({ path: "/companies", query: { per_page, starting_after } })),
  );

  server.registerTool(
    "intercom_get_company",
    {
      title: "Get company",
      description: "Get a company by Intercom id.",
      inputSchema: { company_id: z.string() },
    },
    async ({ company_id }) =>
      run(() => intercom.request({ path: `/companies/${encodeURIComponent(company_id)}` })),
  );

  server.registerTool(
    "intercom_create_or_update_company",
    {
      title: "Create or update company",
      description:
        "Create a company or update one if a matching company_id exists. Intercom's POST /companies upserts.",
      inputSchema: {
        company_id: z.string().describe("Your external company id"),
        name: z.string().optional(),
        plan: z.string().optional(),
        size: z.number().int().optional(),
        website: z.string().optional(),
        industry: z.string().optional(),
        custom_attributes: z.record(z.any()).optional(),
      },
    },
    async (args) => run(() => intercom.request({ method: "POST", path: "/companies", body: args })),
  );

  // ── Articles ────────────────────────────────────────────────────────────────
  server.registerTool(
    "intercom_list_articles",
    {
      title: "List articles",
      description: "List Help Center articles.",
      inputSchema: pagination,
    },
    async ({ per_page, starting_after }) =>
      run(() => intercom.request({ path: "/articles", query: { per_page, starting_after } })),
  );

  server.registerTool(
    "intercom_get_article",
    {
      title: "Get article",
      description: "Get a Help Center article by id.",
      inputSchema: { article_id: z.string() },
    },
    async ({ article_id }) =>
      run(() => intercom.request({ path: `/articles/${encodeURIComponent(article_id)}` })),
  );

  // ── Tags ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "intercom_list_tags",
    {
      title: "List tags",
      description: "List tags defined in the workspace.",
      inputSchema: {},
    },
    async () => run(() => intercom.request({ path: "/tags" })),
  );

  server.registerTool(
    "intercom_tag_contact",
    {
      title: "Tag contact",
      description: "Apply a tag to a contact.",
      inputSchema: { contact_id: z.string(), tag_id: z.string() },
    },
    async ({ contact_id, tag_id }) =>
      run(() =>
        intercom.request({
          method: "POST",
          path: `/contacts/${encodeURIComponent(contact_id)}/tags`,
          body: { id: tag_id },
        }),
      ),
  );

  // ── Outbound messages ───────────────────────────────────────────────────────
  server.registerTool(
    "intercom_send_message",
    {
      title: "Send outbound message",
      description: "Send an in-app or email message from an admin to a user or lead.",
      inputSchema: {
        message_type: z.enum(["in_app", "email"]),
        subject: z.string().optional().describe("Required for email messages"),
        body: z.string().describe("HTML body"),
        template: z.enum(["plain", "personal"]).optional().describe("Email template (default: plain)"),
        from: z.object({ type: z.literal("admin"), id: z.string() }),
        to: z.object({
          type: z.enum(["user", "lead", "contact"]),
          id: z.string().optional(),
          user_id: z.string().optional(),
          email: z.string().optional(),
        }),
        create_conversation_without_contact_reply: z.boolean().optional(),
      },
    },
    async (args) => run(() => intercom.request({ method: "POST", path: "/messages", body: args })),
  );

  // ── Generic escape hatch ────────────────────────────────────────────────────
  server.registerTool(
    "intercom_request",
    {
      title: "Raw Intercom API request",
      description:
        "Escape hatch for any Intercom REST endpoint not covered by a dedicated tool. Pass method, path, optional query, and optional JSON body.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
        path: z.string().describe("Path beginning with '/' (e.g. /segments)"),
        query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
        body: z.any().optional(),
      },
    },
    async ({ method, path, query, body }) =>
      run(() => intercom.request({ method, path, query, body })),
  );
}
