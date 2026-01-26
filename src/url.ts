/**
 * 获取link
 * @param {string} url - 需要处理的url
 */
export function getLink(url: string) {
  const div = document.createElement('div')
  div.innerHTML = '<a/>'
  const link = div.firstChild as HTMLAnchorElement
  link.href = url
  return link
}
