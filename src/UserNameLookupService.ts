import { WebClient } from "@slack/web-api";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { getAll } from "./webapi-pagination";
import { SlackConfigObject } from "./lib/Configuration";

const CACHEFILE = "./user-cache.json";
type Username = string;
export type UserCache = { [usercode: string]: Username };

// Caches the user list for 24 hours for performance and to avoid rate-limiting
export class UserNameLookupService {
  web: WebClient;
  userCache: UserCache;
  ready: Promise<void>;
  slack: SlackConfigObject;
  constructor(web: WebClient, slack: SlackConfigObject) {
    this.web = web;
    this.userCache = {};
    this.slack = slack;
    if (existsSync(CACHEFILE)) {
      try {
        this.userCache = JSON.parse(readFileSync(CACHEFILE, "utf8"));
        console.log(
          `Read ${Object.keys(this.userCache).length} users from disk cache...`
        );
        this.ready = Promise.resolve();
      } catch (e) {
        console.log(e);
        console.log("This was a non-fatal error loading the user cache");
        this.ready = this.fetchAndCacheUserList();
      }
    } else {
      this.ready = this.fetchAndCacheUserList();
    }
    // Refresh user names every 24 hours
    const daily = 1000 * 60 * 60 * 24;
    setInterval(() => this.fetchAndCacheUserList(), daily);
  }

  async getUsernames(userCodes: string[]) {
    await this.ready; // ensure cache is populated
    return userCodes.map((usercode) => ({
      usercode,
      username: this.userCache[usercode],
    }));
  }

  async getUsernameDictionary() {
    await this.ready;
    return this.userCache;
  }

  async getBotUserId() {
    await this.ready;
    const userId = Object.keys(this.userCache).filter(
      (usercode) => this.userCache[usercode] === this.slack.botname
    );
    return userId[0];
  }

  private async fetchAndCacheUserList() {
    // https://api.slack.com/methods/users.list
    console.log("Fetching user list from Slack...");
    const users = await getAll(this.web.users.list, {}, "members");
    users.forEach(
      (user) =>
        (this.userCache[user.id] = user.profile?.display_name || user.name)
    );
    console.log(`Fetched ${users?.length} from Slack via user.list`);
    try {
      writeFileSync(CACHEFILE, JSON.stringify(this.userCache, null, 2));
      console.log("Wrote user cache to disk");
    } catch (e) {
      console.log(e);
      console.log("This was an error writing the user cache to disk");
    }
  }
}
