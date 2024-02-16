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
}

const GitLabCommentProvider = (options: Options): CustomContextProvider => ({
  title: options.title ?? "gitlab_mr",
  displayTitle: options.display ?? "GitLab MR Comments",
  description: "Get GitLab comments for this branch's Merge Request",
  getContextItems: async (
    issueId: string,
    extras: ContextProviderExtras
  ): Promise<ContextItem[]> => {
    const workingDir = await extras.ide
      .getWorkspaceDirs()
      .then((results) => results[0]);

    const subprocess = (command: string) =>
      extras.ide
        .subprocess(`cd ${workingDir}; ${command}`)
        .then(trimStdoutResponse);

    const { branch, project } = await getRemoteBranchName(subprocess);

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

    if (!mergeRequests?.length) {
      return [];
    }

    const mergeRequest = mergeRequests[0];

    const comments = await api.get<Array<GitLabComment>>(
      `/v4/projects/${mergeRequest.project_id}/merge_requests/${mergeRequest.iid}/notes`,
      {
        params: {
          sort: "asc",
          order_by: "updated_at",
        },
      }
    );

    const parts = [
      `# GitLab Merge Request Comments`,
      ...comments.data
        .filter((x) => x.resolvable /* && !x.resolved */)
        .map(
          (comment) =>
            `## ${comment.author.name} on ${comment.created_at}\n\n${comment.body}`
        ),
    ];

    const content = parts.join("\n\n");

    return [
      {
        name: `GitLab MR Comments`,
        content,
        description: `Unresolved comments from the Merge Request for this branch.`,
      },
    ];
  },
});

export default GitLabCommentProvider;
