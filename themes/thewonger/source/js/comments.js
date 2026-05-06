(function () {
  var body = document.body;
  if (!body) return;

  var section = document.querySelector("[data-comments-section]");
  if (!section) return;

  var apiBase = body.getAttribute("data-comments-api");
  if (!apiBase) return;

  var path = normalizePath(body.getAttribute("data-analytics-path") || window.location.pathname);
  var list = section.querySelector("[data-comments-list]");
  var status = section.querySelector("[data-comments-status]");
  var form = section.querySelector("[data-comments-form]");
  var authorToggle = section.querySelector("[data-comments-author-toggle]");
  var authorMode = false;
  var pendingAuthorLoad = false;

  function normalizePath(value) {
    try {
      var url = new URL(value, window.location.origin);
      var pathname = url.pathname || "/";
      pathname = pathname.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
      if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "/");
      return pathname.charAt(0) === "/" ? pathname : "/" + pathname;
    } catch (error) {
      return window.location.pathname || "/";
    }
  }

  function endpoint(route) {
    return apiBase.replace(/\/+$/, "") + route;
  }

  function setStatus(message, isError) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("comments-status-error", Boolean(isError));
  }

  function setAuthorSignInStatus() {
    if (!status) return;

    status.textContent = "";
    status.classList.add("comments-status-error");
    status.appendChild(document.createTextNode("Cần đăng nhập Cloudflare Access để duyệt và trả lời."));

    var link = document.createElement("a");
    link.className = "comments-status-link font800 text-leaf underline underline-offset-2";
    link.href = authorSignInUrl();
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Đăng nhập";
    status.appendChild(document.createTextNode(" "));
    status.appendChild(link);
  }

  function authorSignInUrl() {
    return new URL(endpoint("/author?path=") + encodeURIComponent(path), window.location.origin).href;
  }

  function requestJson(url, options) {
    return fetch(url, options || {}).then(function (response) {
      return response.text().then(function (text) {
        var payload = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch (error) {
          payload = null;
        }

        if (!response.ok) {
          var message = payload && payload.error ? payload.error : "Request failed";
          throw new Error(message);
        }

        return payload;
      });
    });
  }

  function loadPublicComments() {
    setStatus("Đang tải bình luận...", false);
    return requestJson(endpoint("?path=") + encodeURIComponent(path), {
      headers: { Accept: "application/json" }
    })
      .then(function (payload) {
        renderComments(payload.comments || [], false);
        setStatus(commentCountText(payload.comments || []), false);
      })
      .catch(function () {
        renderComments([], false);
        setStatus("Chưa thể tải bình luận lúc này.", true);
      });
  }

  function loadAuthorComments() {
    if (pendingAuthorLoad) return;
    pendingAuthorLoad = true;
    setStatus("Đang kiểm tra quyền tác giả...", false);

    return requestJson(endpoint("/author?path=") + encodeURIComponent(path), {
      headers: { Accept: "application/json" },
      credentials: "include"
    })
      .then(function (payload) {
        authorMode = true;
        section.classList.add("comments-author-mode");
        if (authorToggle) authorToggle.textContent = "Thoát chế độ tác giả";
        renderComments(payload.comments || [], true);
        setStatus(commentCountText(payload.comments || []), false);
      })
      .catch(function () {
        authorMode = false;
        section.classList.remove("comments-author-mode");
        if (authorToggle) authorToggle.textContent = "Chế độ tác giả";
        setAuthorSignInStatus();
      })
      .finally(function () {
        pendingAuthorLoad = false;
      });
  }

  function commentCountText(comments) {
    var total = flattenComments(comments).filter(function (comment) {
      return !comment.status || comment.status === "approved";
    }).length;

    if (authorMode) {
      var pending = flattenComments(comments).filter(function (comment) {
        return comment.status === "pending";
      }).length;
      return total + " bình luận đã duyệt" + (pending ? ", " + pending + " đang chờ duyệt" : "");
    }

    return total ? total + " bình luận" : "Chưa có bình luận nào.";
  }

  function flattenComments(comments) {
    return comments.reduce(function (items, comment) {
      items.push(comment);
      return items.concat(flattenComments(comment.replies || []));
    }, []);
  }

  function renderComments(comments, withControls) {
    list.textContent = "";

    if (!comments.length) {
      var empty = document.createElement("p");
      empty.className = "comments-empty rounded-lg border border-line p-4 text-sm leading-7 text-muted";
      empty.textContent = withControls ? "Chưa có bình luận nào cho bài viết này." : "Hãy là người đầu tiên để lại bình luận.";
      list.appendChild(empty);
      return;
    }

    comments.forEach(function (comment) {
      list.appendChild(renderComment(comment, withControls));
    });
  }

  function renderComment(comment, withControls) {
    var item = document.createElement("article");
    item.className = "comment-item rounded-lg border border-line p-4";
    item.dataset.commentId = comment.id;
    item.dataset.status = comment.status || "approved";

    var header = document.createElement("div");
    header.className = "comment-header flex flex-wrap items-center gap-2";

    var name = document.createElement("strong");
    name.className = "comment-name text-sm font800 text-ink";
    name.textContent = comment.displayName || "Ẩn danh";
    header.appendChild(name);

    if (comment.authorType === "author") {
      var badge = document.createElement("span");
      badge.className = "comment-badge rounded-full bg-[#e8f3ef] px-2 py-1 text-xs font800 leading-none text-leaf";
      badge.textContent = "Tác giả";
      header.appendChild(badge);
    }

    if (withControls && comment.status) {
      var statusBadge = document.createElement("span");
      statusBadge.className = "comment-status-badge rounded-full bg-mist px-2 py-1 text-xs font800 leading-none text-muted";
      statusBadge.textContent = statusLabel(comment.status);
      header.appendChild(statusBadge);
    }

    var time = document.createElement("time");
    time.className = "comment-time text-xs text-muted sm:ml-auto";
    time.dateTime = comment.createdAt || "";
    time.textContent = formatDate(comment.createdAt);
    header.appendChild(time);

    var content = document.createElement("p");
    content.className = "comment-body mt-3 whitespace-pre-wrap text-base leading-7 text-ink";
    content.textContent = comment.body || "";

    item.appendChild(header);
    item.appendChild(content);

    if (withControls && comment.authorType !== "author") {
      item.appendChild(renderControls(comment));
    }

    if (comment.replies && comment.replies.length) {
      var replies = document.createElement("div");
      replies.className = "comment-replies mt-4 grid gap-3 border-l-2 border-line pl-4";
      comment.replies.forEach(function (reply) {
        replies.appendChild(renderComment(reply, withControls));
      });
      item.appendChild(replies);
    }

    return item;
  }

  function renderControls(comment) {
    var controls = document.createElement("div");
    controls.className = "comment-controls mt-4 flex flex-wrap items-center gap-2";

    if (comment.status !== "approved") {
      controls.appendChild(actionButton("Duyệt", function () {
        moderate(comment.id, "approve");
      }));
    }

    if (comment.status !== "rejected") {
      controls.appendChild(actionButton("Từ chối", function () {
        moderate(comment.id, "reject");
      }));
    }

    controls.appendChild(actionButton("Trả lời", function () {
      showReplyForm(comment.id, controls);
    }));

    return controls;
  }

  function actionButton(label, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "comment-action inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-xs font700 text-ink transition hover:border-leaf hover:text-leaf";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function showReplyForm(commentId, container) {
    var existing = container.querySelector("[data-comment-reply-form]");
    if (existing) {
      existing.remove();
      return;
    }

    var replyForm = document.createElement("form");
    replyForm.className = "comment-reply-form mt-3 grid w-full gap-3";
    replyForm.dataset.commentReplyForm = "true";

    var textarea = document.createElement("textarea");
    textarea.className = "comments-textarea block min-h-28 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-base leading-7 text-ink outline-none transition focus:border-leaf focus:ring-4 focus:ring-[#16835f24]";
    textarea.rows = 3;
    textarea.maxLength = 2000;
    textarea.required = true;

    var submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "comments-submit inline-flex min-h-[42px] items-center justify-center rounded-lg border border-leaf bg-leaf px-4 text-sm font700 leading-none text-white transition hover:bg-[#11684b]";
    submit.textContent = "Gửi trả lời";

    replyForm.appendChild(textarea);
    replyForm.appendChild(submit);

    replyForm.addEventListener("submit", function (event) {
      event.preventDefault();
      reply(commentId, textarea.value);
    });

    container.appendChild(replyForm);
    textarea.focus();
  }

  function moderate(commentId, action) {
    setStatus("Đang cập nhật bình luận...", false);
    return requestJson(endpoint("/author/" + encodeURIComponent(commentId) + "/" + action), {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "include"
    })
      .then(loadAuthorComments)
      .catch(function (error) {
        setStatus(error.message || "Không thể cập nhật bình luận.", true);
      });
  }

  function reply(commentId, body) {
    setStatus("Đang gửi trả lời...", false);
    return requestJson(endpoint("/author/" + encodeURIComponent(commentId) + "/reply"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ body: body })
    })
      .then(loadAuthorComments)
      .catch(function (error) {
        setStatus(error.message || "Không thể gửi trả lời.", true);
      });
  }

  function statusLabel(value) {
    if (value === "pending") return "Chờ duyệt";
    if (value === "rejected") return "Đã từ chối";
    return "Đã duyệt";
  }

  function formatDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(date);
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var formData = new FormData(form);
      setStatus("Đang gửi bình luận...", false);

      requestJson(endpoint(""), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          path: path,
          name: formData.get("name"),
          body: formData.get("body"),
          website: formData.get("website")
        })
      })
        .then(function () {
          form.reset();
          setStatus("Bình luận đã được gửi và đang chờ duyệt.", false);
          return loadPublicComments();
        })
        .catch(function (error) {
          setStatus(error.message || "Không thể gửi bình luận.", true);
        });
    });
  }

  if (authorToggle) {
    authorToggle.addEventListener("click", function () {
      if (authorMode) {
        authorMode = false;
        section.classList.remove("comments-author-mode");
        authorToggle.textContent = "Chế độ tác giả";
        loadPublicComments();
        return;
      }

      loadAuthorComments();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadPublicComments, { once: true });
  } else {
    loadPublicComments();
  }
})();
