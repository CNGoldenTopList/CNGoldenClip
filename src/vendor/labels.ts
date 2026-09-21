/** From CNGist shared/src/labels.ts; see README.md in this directory. */
export const challengeDisplayName = (challenge: { name: string }) =>
  challenge.name.replace(/\[(C\/FC|FC|C)\]\s*$/i, "$1");
