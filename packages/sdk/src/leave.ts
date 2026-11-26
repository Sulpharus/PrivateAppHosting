/**
 * Goes to a portal page (sign-in, sign-out). In the installed portal's app viewer (ADR 0032) the
 * app is a frame and the portal refuses to be framed, so the portal is asked to open the page
 * itself. The gate lets only the portal frame an app, so a framed app always sits in the portal;
 * the message goes to the portal's origin only.
 */
export function leavePage(
  url: string,
  portalUrl: string,
  win: Pick<Window, 'parent' | 'top' | 'location'> = window,
): void {
  const framed = win.parent !== (win as unknown) && win.parent === win.top;
  if (framed) win.parent.postMessage({ type: 'mn:open', url }, new URL(portalUrl).origin);
  else win.location.assign(url);
}
