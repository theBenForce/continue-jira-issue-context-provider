# Continue Jira Issue Context Provider

This is a custom context provider that can be integrated with [Continue](https://continue.dev/). It enables users to select a Jira issue and incorporate its content within their context seamlessly.

## Setup

To get started, navigate your terminal to `~/.continue` directory and execute the following command:

```bash
npm i continue-jira-issue-context-provider
```

Next, edit the `~/.continue/config.ts` file so that it looks like this:

```typescript
import JiraContextProvider from "continue-jira-issue-context-provider";

export function modifyConfig(config: Config): Config {
  if (!config.contextProviders) {
    config.contextProviders = [];
  }

  config.contextProviders.push(
    JiraContextProvider({
      instance: "https://YOUR_INSTANCE.atlassian.net",
      email: "YOUR_EMAIL",
      token: "JIRA_PERSONAL_ACCESS_TOKEN",
    })
  );
  return config;
}
```

### Customizing the Issue Query

By default the following query is used to find issues:

```jql
assignee = currentUser() AND resolution = Unresolved order by updated DESC
```

If you want to use a different query, you can override it by passing in the `issueQuery` parameter
when adding the `JiraContextProvider` context provider.

## Use

When using Continue, press type @ then select Jira. A list of issues from Jira will show up. You
can continue typing to search through them and highlight the one you want and press enter.
