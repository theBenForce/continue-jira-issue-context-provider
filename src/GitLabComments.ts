// import "../types/core/index";
import Axios, { AxiosInstance } from "axios";

interface GitHubApiParams {
  domain?: string;
  token: string;
}

const createGitHubApi = ({ domain, token }: GitHubApiParams): AxiosInstance => {
  console.assert(!!token, "No `token` provided");

  return Axios.create({
    baseURL: `https://${domain ?? "gitlab.com"}/api`,
    headers: {
      "PRIVATE-TOKEN": token,
    },
  });
};

interface Options {
  domain?: string;
  token: string;
  title?: string;
  display?: string;
}

const trimStdoutResponse = (args: Array<string>): string => {
  return args[0].trim();
};

type SubprocessExec = (command: string) => Promise<string>;

interface RemoteBranchInfo {
  branch: string | null;
  project: string | null;
}

const getRemoteBranchName = async (
  subprocess: SubprocessExec
): Promise<RemoteBranchInfo> => {
  const branchInfo = await subprocess(`git branch -vv`);

  console.dir({ branchInfo });
  const currentBranchInfo = branchInfo
    .split("\n")
    .find((line) => line.startsWith("*"));
  const branchName = await subprocess(`git branch --show-current`);

  console.dir({ currentBranchInfo });

  const branchRemote = await subprocess(
    `git config branch.${branchName}.remote`
  );

  console.dir({ branchRemote });

  const remoteMatches = RegExp(
    `\\[${branchRemote}/(?<remote_branch>[^\\]]+)\\]`
  ).exec(currentBranchInfo!);

  console.dir({ remoteMatches });

  const remoteBranch = remoteMatches?.groups?.["remote_branch"] ?? null;

  const remoteUrl = await subprocess(`git remote get-url ${branchRemote}`);

  const urlMatches = RegExp(`:(?<project>.*).git`).exec(remoteUrl);

  const project = urlMatches?.groups?.["project"] ?? null;

  return {
    branch: remoteBranch,
    project,
  };
};

interface GitLabComment {
  type: null | "DiffNote";
  resolvable: boolean;
  resolved?: boolean;
  body: string;
  created_at: string;
  author: {
    id: number;
    username: string;
    name: string;
    state: "active";
    locked: boolean;
    avatar_url: string;
    web_url: string;
  };
  position?: {
    new_path: string;
    new_line: number;
    head_sha: string;
    line_range: {
      start: {
        line_code: string;
        type: "new";
        old_line: null;
        new_line: number;
      };
      end: {
        line_code: string;
        type: "new";
        old_line: null;
        new_line: number;
      };
    };
  };
}

const GitLabCommentProvider = (options: Options): CustomContextProvider => ({
  title: options.title ?? "gitlab_mr",
  displayTitle: options.display ?? "GitLab MR Comments",
  description: "Get GitLab comments for this branch's Merge Request",
  getContextItems: async (
    issueId: string,
    extras: ContextProviderExtras
  ): Promise<ContextItem[]> => {
    const parts = [`# GitLab Merge Request Comments`];

    const workingDir = await extras.ide
      .getWorkspaceDirs()
      .then((results) => results[0]);

    const subprocess = (command: string) =>
      extras.ide
        .subprocess(`cd ${workingDir}; ${command}`)
        .then(trimStdoutResponse);

    const { branch, project } = await getRemoteBranchName(subprocess);

    parts.push(`Branch: ${branch}\nProject: ${project}`);

    // @ts-ignore
    const api = createGitHubApi(options);

    const mergeRequests = await api
      .get<Array<{ iid: number; project_id: number }>>(
        `/v4/projects/${encodeURIComponent(project!)}/merge_requests`,
        {
          params: {
            source_branch: branch,
            state: "opened",
          },
        }
      )
      .then((x) => x.data)
      .catch((err) => err.response?.data);

    if (mergeRequests?.length) {
      const mergeRequest = mergeRequests[0];

      parts.push(`Merge Request: ${mergeRequest.iid}`);

      const comments = await api.get<Array<GitLabComment>>(
        `/v4/projects/${mergeRequest.project_id}/merge_requests/${mergeRequest.iid}/notes`,
        {
          params: {
            sort: "asc",
            order_by: "created_at",
          },
        }
      );

      const locations = {} as Record<string, Array<GitLabComment>>;

      for (const comment of comments.data.filter(
        (x) => x.type === "DiffNote"
      )) {
        const filename = comment.position?.new_path ?? "general";

        if (!locations[filename]) {
          locations[filename] = [];
        }

        locations[filename].push(comment);
      }

      const commentFormatter = (comment: GitLabComment) => {
        const commentParts = [
          `### ${comment.author.name} on ${comment.created_at}${
            comment.resolved ? " (Resolved)" : ""
          }`,
        ];

        if (comment.position?.new_line) {
          commentParts.push(
            `line: ${comment.position.new_line}\ncommit: ${comment.position.head_sha}`
          );
        }

        commentParts.push(comment.body);

        return commentParts.join("\n\n");
      };

      for (const [filename, locationComments] of Object.entries(locations)) {
        if (filename !== "general") {
          parts.push(`## File ${filename}`);
          locationComments.sort(
            (a, b) => a.position!.new_line - b.position!.new_line
          );
        } else {
          parts.push("## Comments");
        }

        parts.push(...locationComments.map(commentFormatter));
      }
    }

    const content = parts.join("\n\n");

    return [
      {
        name: `GitLab MR Comments`,
        content,
        description: `Comments from the Merge Request for this branch.`,
      },
    ];
  },
});

export default GitLabCommentProvider;
