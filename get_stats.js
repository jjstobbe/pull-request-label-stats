const github = require('octonode');
const fs = require('fs');
const utilities = require('./utilities');

var config = utilities.readJsonFile('./config.json');
var client = github.client(config.githubAuthToken);

const per_page = 100

fetchPullReqestsForRepositoryName = (repositoryName) => {
    var repositoryObject = client.repo(`${config.domain}/${repositoryName}`);
    return recursiveFindAllPrs(repositoryObject, 0)
}

recursiveFindAllPrs = async (repositoryObject, page) => {
    console.log(`Repository: ${repositoryObject.name}, Page: ${page}`);

    var response = await fetchPageOfPullRequests(repositoryObject, page);

    if (response.length != 2) {
        return [];
    }

    const prs = response[0];

    const pullRequestUrls = prs
        .filter(pr => pr.merged_at != null)
        .filter(pr => pr.labels && pr.labels.some(l => l.name.toLowerCase().indexOf(config.label) > 0))
        .map(pr => pr.url);

    // If there were less than max number of PRs, we don't have to go to next page
    if (prs.length < per_page) {
        return pullRequestUrls;
    }

    return pullRequestUrls.concat(await recursiveFindAllPrs(repositoryObject, page + 1));
}

fetchPageOfPullRequests = async (repositoryObject, page) => {
    let response = [];

    if (page > 10) {
        return [];
    }

    do {
        try {
            response = await repositoryObject.prsAsync({
                page,
                per_page,
                state: config.pullRequestState,
            });
        } catch (e) {
            const retryAfter = parseInt(e.headers['retry-after']) || 60;
            const seconds = retryAfter + 10; // adding 10 seconds for good measure
            
            console.log(`Failure, waiting ${seconds} seconds before retrying again`)
            await sleep(seconds * 1000)
        }
    } while (response.length == 0)

    return response;
}

fetchPullReqestInfoForUrl = (url) => {
    const urlSplit = url.split('/')
    const repo = urlSplit[5]
    const number = urlSplit[7]

    const prObject = client.pr(`${config.domain}/${repo}`, number);

    console.log(`Pull Request: ${url}`);

    return fetchPullRequestInfo(prObject);
}

fetchPullRequestInfo = async (prObject) => {
    do {
        try {
            response = await prObject.infoAsync();
        } catch (e) {
            const retryAfter = parseInt(e.headers['retry-after']) || 60;
            const seconds = retryAfter + 10; // adding 10 seconds for good measure
            
            console.log(`Failure, waiting ${seconds} seconds before retrying again`)
            await sleep(seconds * 1000)
        }
    } while (response.length != 2)

    return response[0];
}

(async () => {
    const repositoryNameChunks = config.repositoriesToSearch.chunk(2);

    let pullRequestUrls = [];
    for (const repositoryNameChunk of repositoryNameChunks) {
        const pullRequestPromises = repositoryNameChunk.map(fetchPullReqestsForRepositoryName);
        const urls = (await Promise.all(pullRequestPromises)).flat();

        pullRequestUrls.push(...urls);
    }

    const uniquePullRequestUrls = [...new Set(pullRequestUrls)];

    console.log(`Found ${uniquePullRequestUrls.length} PRs`)

    fs.writeFileSync('pull-requests.json', JSON.stringify(uniquePullRequestUrls), 'utf8', null);
    var urls = JSON.parse(fs.readFileSync('pull-requests.json', 'utf8'));

    var commits = 0;
    var additions = 0;
    var deletions = 0;
    var changed_files = 0;

    const urlChunks = urls.chunk(2);
    
    for (urlChunk of urlChunks) {
        const pullRequestInfoPromises = urlChunk.map(fetchPullReqestInfoForUrl);
        const prs = (await Promise.all(pullRequestInfoPromises)).flat();

        prs.forEach(pr => {
            commits += pr.commits;
            additions += pr.additions;
            deletions += pr.deletions;
            changed_files += pr.changed_files;
        });
    }

    console.log("Commits: ", commits);
    console.log("Additions: ", additions);
    console.log("Deletions: ", deletions);
    console.log("Changed Files: ", changed_files);

})().catch(err => console.log(err))
