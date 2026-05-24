/* Wukong conversation sidebar shortcuts.
 * You can edit this file later to add/remove entries.
 *
 * Supported fields:
 * - id: stable id
 * - labelKey: i18n key, or use label directly
 * - label: fallback label
 * - icon: Font Awesome classes, or a plain emoji/text fallback
 * - href: supports {uid}, {userslug}, {username}, {relative_path}
 */
(function () {
  window.NBBWukongConversationSidebarLinks = [
    {
      id: "profile",
      labelKey: "profile",
      label: "个人主页",
      icon: "fa-regular fa-user",
      href: "{relative_path}/user/{userslug}"
    },
    {
      id: "settings",
      labelKey: "settings",
      label: "设置",
      icon: "fa-solid fa-gear",
      href: "{relative_path}/user/{userslug}/settings"
    },
    {
      id: "messages",
      labelKey: "messages",
      label: "消息",
      icon: "fa-regular fa-comments",
      href: "{relative_path}/wukong/conversations"
    }
  ];
})();
