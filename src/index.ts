// import "../types/core/index";
import Axios, { AxiosInstance } from "axios";

import "./types/index";

// @ts-ignore
import * as adf2md from "adf-to-md";

interface JiraApiParams {
  instance: string;
  email: string;
  token: string;
}

const createJiraApi = ({
  instance,
  email,
  token,
}: JiraApiParams): AxiosInstance => {
  console.assert(!!instance, "No `instance` provided");
  console.assert(!!email, "No `email` provided");
  console.assert(!!token, "No `token` provided");

  return Axios.create({
    baseURL: `${instance}/rest/api/3`,
    auth: {
      username: email,
      password: token,
    },
  });
};

interface Options {
  instance: string;
  email: string;
  token: string;
  issueQuery?: string;
}

interface JiraComment {
  id: string;
  author: {
    emailAddress: string;
    displayName: string;
  };
  body: object;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: object;
    comment: {
      total: number;
      comments: Array<JiraComment>;
    };
  };
}

interface QueryResults {
  issues: JiraIssue[];
}

const JiraContexProvider = (options: Options): CustomContextProvider => ({
  title: "jira",
  displayTitle: "Jira",
  description: "Retrieve ticket information from Jira",
  type: "submenu",
  loadSubmenuItems: async (
    args: LoadSubmenuItemsArgs
  ): Promise<ContextSubmenuItem[]> => {
    // @ts-ignore
    const api = createJiraApi(options);

    try {
      const results = await api.get<QueryResults>("/search", {
        params: {
          jql:
            options.issueQuery ??
            `assignee = currentUser() AND resolution = Unresolved order by updated DESC`,
          fields: "summary",
        },
      });

      return results.data.issues.map((issue) => ({
        id: issue.id,
        title: `${issue.key}: ${issue.fields.summary}`,
        description: "",
      }));
    } catch (ex) {
      console.error(`Unable to get jira tickets: ${ex}`);
      return [];
    }
  },
  getContextItems: async (
    issueId: string,
    extras: ContextProviderExtras
  ): Promise<ContextItem[]> => {
    // @ts-ignore
    const api = createJiraApi(options);

    const issue = await api
      .get<JiraIssue>(`/issue/${issueId}`, {
        params: {
          fields: "description,comment,summary",
        },
      })
      .then((result) => result.data);

    let content = `# Jira Issue ${issue.key}\n\n${issue.fields.summary}`;

    const description = issue.fields.description
      ? adf2md.convert(issue.fields.description)
      : "No description";

    const parts = [
      description.result,
      ...issue.fields.comment.comments.map(
        (comment) => adf2md.convert(comment.body).result
      ),
    ];

    content += "\n\n" + parts.join("\n\n---\n\n");

    return [
      {
        name: `${issue.key}: ${issue.fields.summary}`,
        content,
        description: issue.key,
      },
    ];
  },
});

export default JiraContexProvider;
