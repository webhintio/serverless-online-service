import { Octokit } from '@octokit/rest';

import { IssueData } from '../types/issuedata';

const { NODE_ENV, environment } = process.env; // eslint-disable-line no-process-env

const production = NODE_ENV !== 'development';

type GithubData = {
    owner: string;
    repo: string;
}

/*
 * Octokit/types doesn't define a type for the items in a search and
 * doesn't export the type IssuesUpdateEndpoint.
 * These are a copy/paste of what they have in their code.
 * Any suggestion to do this in a better way?
 */
/* eslint-disable camelcase */
type SearchItem = {
    url: string;
    repository_url: string;
    labels_url: string;
    comments_url: string;
    events_url: string;
    html_url: string;
    id: number;
    node_id: string;
    number: number;
    title: string;
    user: {
        login: string;
        id: number;
        node_id: string;
        avatar_url: string;
        gravatar_id: string;
        url: string;
        html_url: string;
        followers_url: string;
        following_url: string;
        gists_url: string;
        starred_url: string;
        subscriptions_url: string;
        organizations_url: string;
        repos_url: string;
        events_url: string;
        received_events_url: string;
        type: string;
    };
    labels: {
        id: number;
        node_id: string;
        url: string;
        name: string;
        color: string;
    }[];
    state: string;
    assignee: string;
    milestone: string;
    comments: number;
    created_at: string;
    updated_at: string;
    closed_at: string;
    pull_request: {
        html_url: string;
        diff_url: string;
        patch_url: string;
    };
    body: string;
    score: number;
};

type IssuesUpdateEndpoint = {
    owner: string;
    repo: string;
    issue_number: number;
    /**
     * The title of the issue.
     */
    title?: string;
    /**
     * The contents of the issue.
     */
    body?: string;
    /**
     * Login for the user that this issue should be assigned to. **This field is deprecated.**
     */
    assignee?: string;
    /**
     * State of the issue. Either `open` or `closed`.
     */
    state?: 'open' | 'closed';
    /**
     * The `number` of the milestone to associate this issue with or `null` to remove current. _NOTE: Only users with push access can set the milestone for issues. The milestone is silently dropped otherwise._
     */
    milestone?: number | null;
    /**
     * Labels to associate with this issue. Pass one or more Labels to _replace_ the set of Labels on this Issue. Send an empty array (`[]`) to clear all Labels from the Issue. _NOTE: Only users with push access can set labels for issues. Labels are silently dropped otherwise._
     */
    labels?: string[];
    /**
     * Logins for Users to assign to this issue. Pass one or more user logins to _replace_ the set of assignees on this Issue. Send an empty array (`[]`) to clear all assignees from the Issue. _NOTE: Only users with push access can set assignees for new issues. Assignees are silently dropped otherwise._
     */
    assignees?: string[];
};
/* eslint-enable camelcase */

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

export class IssueReporter {

    /* eslint-disable no-process-env */
    private GITHUB_API_TOKEN = process.env.GITHUB_API_TOKEN || '';
    private GITHUB_OWNER = process.env.GITHUB_OWNER || '';
    private GITHUB_REPO = process.env.GITHUB_REPO || '';
    private GITHUB_DATA: GithubData;
    /* eslint-enable no-process-env */

    private octokit: Octokit;

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    public constructor() {
        this.GITHUB_DATA = {
            owner: this.GITHUB_OWNER,
            repo: this.GITHUB_REPO
        };
        this.octokit = new Octokit({
            baseUrl: 'https://api.github.com',
            headers: {
                accept: 'application/vnd.github.v3+json',
                'user-agent': 'webhint'
            },
            timeout: 0
        });

        this.octokit.authenticate({
            token: this.GITHUB_API_TOKEN as string,
            type: 'oauth'
        });
    }

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    private addIssueComment(issue: SearchItem, issueData: IssueData) {
        return this.octokit.issues.createComment({
            body: this.getErrorMessage(issueData),
            issue_number: issue.number, // eslint-disable-line camelcase
            owner: this.GITHUB_OWNER,
            repo: this.GITHUB_REPO
        });

    }

    private async closeIssue(issue: SearchItem) {
        await this.editIssue({
            issue_number: issue.number, // eslint-disable-line camelcase
            state: 'closed'
        });
    }

    private editIssue(configs: Partial<IssuesUpdateEndpoint>) {
        return this.octokit.issues.update((Object.assign(
            {},
            this.GITHUB_DATA,
            configs
        ) as IssuesUpdateEndpoint));
    }

    private getErrorMessage(issueData: IssueData) {
        let errorMessage = '';

        if (issueData.errorMessage) {
            errorMessage = `
## Error:

\`\`\`bash
${issueData.errorMessage}
\`\`\`
`;
        }

        errorMessage += `
## Configuration:

\`\`\`json
${JSON.stringify(issueData.configs, null, 4)}
\`\`\`

## Log:

\`\`\`json
${issueData.log}
\`\`\`
`;

        return errorMessage;
    }

    private getErrorTypeLabel(errorType: string | undefined): string {
        if (!errorType) {
            return 'error:unknow';
        }

        return `error:${errorType}`;
    }

    private getScanLabel(scanNumber: string): string {
        return `scan:${scanNumber}`;
    }

    private getEmoji(errorType: 'crash' | 'stderr' | 'timeout' | undefined) {
        let result;

        switch (errorType) {
            case 'crash':
                result = '💥';
                break;
            case 'timeout':
                result = '⏰';
                break;
            default:
                result = 'stderr';
                break;
        }

        return result;
    }

    private async openIssue(issueData: IssueData) {
        const labels = [
            this.getScanLabel(issueData.scan),
            this.getErrorTypeLabel(issueData.errorType)
        ];

        /* istanbul ignore else */
        if (production) {
            labels.push('production');
        }

        /* istanbul ignore if */
        if (environment === 'browser') {
            labels.push('browser');
        }

        const env = environment === undefined ? ' ' : ` [${environment}] `;

        await this.octokit.issues.create(Object.assign(
            {},
            this.GITHUB_DATA,
            {
                body: this.getErrorMessage(issueData),
                labels,
                title: `[${this.getEmoji(issueData.errorType)}]${env}${issueData.url}`
            }
        ));
    }

    private async searchIssues(q: string): Promise<SearchItem[]> {
        const result = await this.octokit.search.issuesAndPullRequests({ q });

        return result.data.items;
    }

    public async report(issueData: IssueData) {

        // Get open issues for a given URL.
        /*
         * Note: Search returns 100 results per page, but
         *       the query shouldn't return so many results.
         */
        const issues = await this.searchIssues(`${issueData.url} in:title is:open repo:${this.GITHUB_DATA.owner}/${this.GITHUB_DATA.repo}`);

        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

        /*
         * If there are no problems in the latest scan run with
         * the given URL, close any existing issues related to it.
         */

        if (!issueData.errorType) {
            for (const issue of issues) {
                await this.closeIssue(issue);
            }

            return;
        }

        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

        // If there were problems with the URL:

        /*
         * 1) If there is already an issue opened for the same problem,
         *    add a new comment to that issue and update the labels.
         */

        for (const issue of issues) {

            const issueLabels = issue.labels.map((label) => {
                return label.name;
            }) || [];

            if (issueLabels.includes(this.getErrorTypeLabel(issueData.errorType))) {
                await this.addIssueComment(issue, issueData);
                await this.updateIssueLabels(issue, issueLabels.concat(this.getScanLabel(issueData.scan)));

                return;
            }
        }

        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

        // 2) Otherwise open a new issue.

        await this.openIssue(issueData);
    }

    private async updateIssueLabels(issue: SearchItem, labels: string[]) {
        await this.editIssue({
            issue_number: issue.number, // eslint-disable-line camelcase
            labels
        });
    }
}
