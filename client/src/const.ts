export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Return local auth page URL instead of OAuth portal
export const getLoginUrl = () => {
  return "/auth";
};
