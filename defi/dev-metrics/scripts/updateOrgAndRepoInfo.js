const { orgSet, repoSet, sleepInMinutes } = require('../utils/index')
const { Octokit } = require('octokit')
const { GitOwner, GitRepo, sequelize, addRawCommit, } = require('../db')
const { extractCommitsFromSimpleGit } = require('../utils/index')
const { getTempFolder, clearTempFolders, deleteFolder, } = require('../utils/cache')
const sdk = require('@defillama/sdk')
const simpleGit = require('simple-git')
const path = require('path')

const octokit = new Octokit({
  auth: process.env.GITHUB_API_KEY,
});

const missingOrgs = new Set([
  'ferum-dex',
  'Arbi-s',
])

async function main() {
  await sequelize.sync()

  const OrgArray = [...orgSet];
  const repoArray = [...repoSet];
  const repoMapping = {}
  for (const repo of repoArray) {
    const [org, repoName] = repo.split('/')
    if (orgSet.has(org)) continue
    if (!repoMapping[org]) repoMapping[org] = {}
    repoMapping[org][repo] = true
  }
  const repoOrgs = Object.keys(repoMapping)
  console.log('org length: ', OrgArray.length)
  console.log('repo orgs length: ', repoOrgs.length)

  // for (const orgName of ['webrtc', 'muaz-khan']) {
  let i = 0
  for (const orgName of OrgArray) {
  // for (const orgName of ['bitcoin']) {
    await updateOrgAndRepos(orgName)
    const progress = Number(100 * ++i / OrgArray.length).toPrecision(4)
    console.log(`[Org] orgs done: ${orgName} ${i}/${OrgArray.length} (${progress}%)`)
  }
  i = 0
  // for (const orgName of ['webrtc']) {
  for (const repoOrg of repoOrgs) {
  // for (const repoOrg of ['zocteam']) {
    await updateOrgAndRepos(repoOrg, Object.keys(repoMapping[repoOrg]))
    const progress = Number(100 * ++i / repoOrgs.length).toPrecision(4)
    console.log(`[Repo] orgs done: ${repoOrg} ${i}/${repoOrgs.length} (${progress}%)`)
    // await sleepInMinutes(1 / 20)
  }
}


async function updateOrgAndRepos(orgName, repoFilter) {
  if (missingOrgs.has(orgName)) return

  try {
    // Check if the organization exists in the database
    const existingOrg = await GitOwner.findOne({ where: { name: orgName } });

    if (existingOrg) {
      // If the organization exists, check the last update time
      const lastUpdateTime = existingOrg.lastUpdateTime;
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      if (lastUpdateTime >= oneWeekAgo) {
        // console.log('Organization is up to date.');
        return;
      }
    }

    let is_org = false
    if (!existingOrg) {
      try {
        const { data } = await octokit.rest.orgs.get({ org: orgName });
        if (data) is_org = true
      } catch (e) { }
    } else {
      is_org = existingOrg.is_org
    }


    let pageLength = 99
    let repositories = []
    const isFirstFech = !existingOrg
    if (!isFirstFech) pageLength = 25
    let hasMorePages = false
    let page = 0
    do {
      // sdk.log('Fetching repos for', orgName, page)
      const params = { per_page: pageLength, sort: 'pushed', page, direction: 'desc' }
      let method = 'listForOrg'
      if (is_org) {
        params.org = orgName
      } else {
        method = 'listForUser'
        params.username = orgName
        params.type = 'owner'
      }

      const { data } = await octokit.rest.repos[method](params)
      ++page
      repositories.push(...data)
      hasMorePages = data.length === pageLength
      if (!isFirstFech && hasMorePages) {
        const lastFetchedRepo = data[data.length - 1]
        hasMorePages = orgData.lastUpdateTime < +new Date(lastFetchedRepo.pushed_at)
      }
      if (hasMorePages)
        sdk.log('Fetching more repos for', orgName, page)
    } while (hasMorePages)

    // console.log({ repoCount: repositories.length, orgName, is_org, isFirstFech, existingOrg })

    if (repoFilter) repositories = repositories.filter(repo => repoFilter.includes(repo.full_name))
    // Update or create each repository in the database
    for (const repo of repositories) {
      // Check if the repository exists in the database
      let existingRepo = await GitRepo.findOne({ where: { full_name: repo.full_name } })

      // Update the repository in the database
      if (existingRepo) {
        await existingRepo.update({
          // Set the desired fields based on the relevant data
          description: repo.description,
          language: repo.language,
          fork: repo.fork,
          forks_count: repo.forks_count,
          html_url: repo.html_url,
          updated_at: repo.updated_at,
          pushed_at: repo.pushed_at,
          ssh_url: repo.ssh_url,
          size: repo.size,
          homepage: repo.homepage,
          stargazers_count: repo.stargazers_count,
          watchers_count: repo.watchers_count,
          default_branch: repo.default_branch,
          open_issues_count: repo.open_issues_count,
          has_issues: repo.has_issues,
          has_projects: repo.has_projects,
          has_wiki: repo.has_wiki,
          has_pages: repo.has_pages,
          has_downloads: repo.has_downloads,
          archived: repo.archived,
          disabled: repo.disabled,
          license: repo.license,
          has_discussions: repo.has_discussions,
          is_template: repo.is_template,
          topics: repo.topics,
          tags: repo.tags,
          ecosystem: repo.ecosystem,
        });
      } else {
        await addCommits(repo)

        // Create the repository in the database
        await GitRepo.create({
          name: repo.name,
          full_name: repo.full_name,
          owner: orgName,
          // Set the desired fields based on the relevant data
          description: repo.description,
          language: repo.language,
          fork: repo.fork,
          forks_count: repo.forks_count,
          html_url: repo.html_url,
          id: repo.id,
          node_id: repo.node_id,
          created_at: repo.created_at,
          updated_at: repo.updated_at,
          pushed_at: repo.pushed_at,
          ssh_url: repo.ssh_url,
          size: repo.size,
          homepage: repo.homepage,
          stargazers_count: repo.stargazers_count,
          watchers_count: repo.watchers_count,
          default_branch: repo.default_branch,
          open_issues_count: repo.open_issues_count,
          has_issues: repo.has_issues,
          has_projects: repo.has_projects,
          has_wiki: repo.has_wiki,
          has_pages: repo.has_pages,
          has_downloads: repo.has_downloads,
          archived: repo.archived,
          disabled: repo.disabled,
          license: repo.license,
          has_discussions: repo.has_discussions,
          is_template: repo.is_template,
          topics: repo.topics,
          tags: repo.tags,
          ecosystem: repo.ecosystem,
        });
      }
    }

    // Update the organization in the database
    if (existingOrg) {
      await existingOrg.update({
        lastUpdateTime: new Date(),
        // Update the desired fields based on the relevant data
        linkedProjects: existingOrg.linkedProjects || [],
        ecosystem: existingOrg.ecosystem || [],
      });
    } else {
      // Create the organization in the database
      await GitOwner.create({
        name: orgName,
        lastUpdateTime: new Date(),
        // Set the desired fields based on the relevant data
        linkedProjects: [],
        is_org: true,
        ecosystem: [],
      });
    }

    // console.log('Org and repos updated successfully: ', orgName, is_org)
    await sleepInMinutes(1 / 15)
  } catch (error) {
    console.error('Error occurred:', error, orgName);
  }
}


async function addCommits(repoData) {
  if (repoData.fork || !repoData.size) return
  const repoCreatedyear = new Date(repoData.created_at).getFullYear()
  if (repoCreatedyear > 2014) return
  // Fetching for the first time, pull the entire repo from github
  const repoPath = getTempFolder()
  const progress = ({ method, stage, progress }) => {
    sdk.log(`git.${method} ${stage} stage ${progress}% complete`);
  }
  const repoName = repoData.full_name
  const repoDir = repoData.name


  sdk.log('Cloning repo for ', repoName, repoData.ssh_url, repoPath, repoDir)
  let git = simpleGit(repoPath, repoDir, { progress });
  await git.clone(repoData.ssh_url)
  git.cwd(path.join(repoPath, repoDir))
  // git = simpleGit(repoPath, repoName, { progress })

  const commitLogs = await git.log({ maxCount: 1e6 })
  let commits = extractCommitsFromSimpleGit(commitLogs.all, repoData)
  commits = commits.filter(commit => new Date(commit.created_at).getFullYear() < 2020)
  for (const commit of commits)
    await addRawCommit(commit)
  deleteFolder(repoPath)
  sdk.log('Cloned and pulled repo for ', repoName, commits.length)
}

// Call the function with the URL of the json.tz file
main()
  .catch(console.error)
  .then(() => sequelize.close())
  .then(() => process.exit(0))
