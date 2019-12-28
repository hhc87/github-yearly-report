import Vue from 'vue';

import {
  YEAR_START,
  HOME_STATUS,
  GITHUB_YEARLY_REPORT_PRE,
  ONE_HOUR,
  ONE_DAY,
  USERINFO_PICK_KEYS,
  ORGS_PICK_KEYS,
} from '@/lib/constant';
import { USERINFO, REPO, REPOS_INFO, STARS_INFO, ORG, COMMIT_ACTIVITY_ITEM } from '@/api/interface';
import { timeoutFn, pick, inStartEndYear } from './lib/utils';
import { handleReposData, handleStarsData, handleCommitsData } from '@/lib/handleData';
import { getStorage, setStorage } from './lib/storage';

const USERINFO_KEY = `${GITHUB_YEARLY_REPORT_PRE}_USERINFO`;
const REPOS_KEY = `${GITHUB_YEARLY_REPORT_PRE}_REPOS`;
const STARS_KEY = `${GITHUB_YEARLY_REPORT_PRE}_STARS`;
const ORGS_KEY = `${GITHUB_YEARLY_REPORT_PRE}_ORGS`;
const COMMITS_KEY = `${GITHUB_YEARLY_REPORT_PRE}_COMMITS`;

interface STORE {
  userInfo?: USERINFO
  reposInfo?: REPOS_INFO
  issues?: any[]
  status?: number
  starsInfo?: STARS_INFO
  userOrgs?: ORG[]
  commitsInfo?: any
}

const app = new Vue<STORE>({
  data: {
    userInfo: {},
    status: 0,
    reposInfo: {},
    starsInfo: {},
    userOrgs: [],
    commitsInfo: {},
  },
});

const st = app.$data;

interface ANY_OBJECT {
  [propName: string]: any;
}

export const mapState = (keys: string[]) => {
  const res: ANY_OBJECT = {};
  keys.forEach((it: string) => {
    (res[it] as any) = () => st[it];
  });
  return res;
};

export const updateState = (payload: ANY_OBJECT) => {
  Object.keys(payload).forEach(it => {
    st[it] = payload[it];
  });
};

export const fetchUserInfo = async (octokit: any) => {
  const userInfoStorage = getStorage(USERINFO_KEY);
  if (userInfoStorage) {
    st.userInfo = userInfoStorage;
  } else {
    const { users } = octokit;
    const res = await timeoutFn(users.getAuthenticated());
    if (+res.status === 200) {
      const data = pick(res.data, USERINFO_PICK_KEYS);
      st.userInfo = data;
      setStorage(USERINFO_KEY, data, ONE_DAY);
    }
  }
};

export const fetchRepos = (octokit: any) => new Promise(async (resolve, reject) => {
  const reposStorage = getStorage(REPOS_KEY);
  if (reposStorage) {
    st.reposInfo = reposStorage;
  } else {
    const { repos } = octokit;
    let originalReposData: REPO[] = [];
    let pageNo: number = 1;
    let hasNext: boolean = true;
    const fn = async (page: number) => {
      const res = await repos.list({
        visibility: 'all',
        sort: 'updated',
        per_page: 100,
        page,
      });
      const { data } = res;
      pageNo += 1;
      originalReposData = originalReposData.concat(data);
      if (data && (data.length === 0 || data.length < 100)) {
        hasNext = false;
      }
    };
    while (pageNo === 1 || hasNext) {
      await fn(pageNo); // eslint-disable-line
    }
    const reposHandleResult = handleReposData(originalReposData);
    st.reposInfo = reposHandleResult;
    setStorage(REPOS_KEY, reposHandleResult, ONE_HOUR);
  }
  resolve();
});

export const fetchStars = (octokit: any) => new Promise(async (resolve, reject) => {
  const storageData = getStorage(STARS_KEY);
  if (storageData) {
    st.starsInfo = storageData;
  } else {
    const { activity } = octokit;
    let originalData: any[] = [];
    let pageNo: number = 1;
    let hasNext: boolean = true;
    const fn = async (page: number) => {
      const res = await activity.listReposStarredByAuthenticatedUser({
        sort: 'created',
        per_page: 100,
        page,
      });
      const { data } = res;
      pageNo += 1;
      originalData = originalData.concat(data);
      if (data && (data.length === 0 || data.length < 100)) {
        hasNext = false;
      }
    };
    while (pageNo === 1 || hasNext) {
      await fn(pageNo); // eslint-disable-line
    }
    const handleResultData = handleStarsData(originalData);
    st.starsInfo = handleResultData;
    setStorage(STARS_KEY, handleResultData, ONE_HOUR);
  }
  resolve();
});

export const fetchOrgs = (octokit: any) => new Promise(async (resolve, reject) => {
  const storageData = getStorage(ORGS_KEY);
  if (storageData) {
    st.userOrgs = storageData;
  } else {
    const { orgs } = octokit;
    let userInfo = getStorage(USERINFO_KEY);
    if (!userInfo) {
      await fetchUserInfo(octokit);
      userInfo = getStorage(USERINFO_KEY);
    }

    const { name } = userInfo;

    let originalData: any[] = [];
    let pageNo: number = 1;
    let hasNext: boolean = true;
    const fn = async (page: number) => {
      const res = await orgs.listForUser({
        username: name,
        per_page: 100,
        page,
      });

      const { data } = res;
      pageNo += 1;
      originalData = originalData.concat(data);
      if (data && (data.length === 0 || data.length < 100)) {
        hasNext = false;
      }
    };
    while (pageNo === 1 || hasNext) {
      await fn(pageNo); // eslint-disable-line
    }
    const pickResult = originalData.map((item: ORG) => pick(item, ORGS_PICK_KEYS));
    const orgsDetail: ORG[] = [];
    for (const item of pickResult) {
      const res = await orgs.get({  // eslint-disable-line
        org: item.login,
      });
      const { data } = res;
      orgsDetail.push(pick(data, ORGS_PICK_KEYS));
    }
    st.userOrgs = orgsDetail;
    setStorage(ORGS_KEY, orgsDetail, ONE_HOUR);
  }
  resolve();
});

export const fetchCommits = (octokit: any) => new Promise(async (resolve, reject) => {
  const storageData = getStorage(COMMITS_KEY);
  if (storageData) {
    st.commitsInfo = storageData;
  } else {
    let userInfo = getStorage(USERINFO_KEY);
    if (!userInfo) {
      await fetchUserInfo(octokit);
      userInfo = getStorage(USERINFO_KEY);
    }
    let reposInfo: any = getStorage(REPOS_KEY);
    if (!reposInfo) {
      await fetchRepos(octokit);
      reposInfo = getStorage(REPOS_KEY);
    }

    const { repos } = octokit;
    const reposInYear = reposInfo.repos.filter((item: REPO) => !item.fork && (inStartEndYear(item.created_at) || inStartEndYear(item.updated_at)));
    const commits = [];

    for (const repo of reposInYear) {
      let originalData: any[] = [];
      let pageNo: number = 1;
      let hasNext: boolean = true;
      const fn = async (page: number) => { // eslint-disable-line
        const res = await repos.getCommitActivityStats({
          owner: userInfo.name,
          repo: repo.name,
          per_page: 100,
          page,
        });

        const { data } = res;
        pageNo += 1;
        originalData = originalData.concat(data);
        if (data && (data.length === 0 || data.length < 100)) {
          hasNext = false;
        }
      };
      while (pageNo === 1 || hasNext) {
        await fn(pageNo); // eslint-disable-line
      }
      originalData = originalData.filter((item: COMMIT_ACTIVITY_ITEM) => item.total > 0);
      if (originalData.length > 0) {
        commits.push({
          repo: repo.name,
          total: originalData.reduce((sum, item: COMMIT_ACTIVITY_ITEM) => sum + item.total, 0),
          commits: originalData,
        });
      }
    }
    const result = handleCommitsData(commits);
    st.commitsInfo = result;
    setStorage(COMMITS_KEY, result, ONE_HOUR);
  }
  resolve();
});

export const fetchAll = async (octokit: any) => {
  try {
    await fetchUserInfo(octokit);
    const all = [
      fetchRepos(octokit),
      fetchStars(octokit),
      fetchOrgs(octokit),
      fetchCommits(octokit),
    ];
    Promise.all(all).then(res => {
      st.status = HOME_STATUS.FINISH;
    }).catch(e => {
      console.log(e);
      st.status = HOME_STATUS.ERROR;
    });
  } catch (e) {
    st.status = HOME_STATUS.ERROR;
  }
};

export default app;
