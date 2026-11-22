/* ============================================================
   通用顶部导航折叠逻辑
   index.html / admin.html / voice.html 共用（zaodu.html 不使用）

   功能：顶部按钮过多、容器装不下时，自动把末尾的按钮收进
         「更多（...）」下拉菜单，避免挤压或横向溢出。

   用法：
     <div class="nav-bar" data-nav-bar>
       <button class="btn">...</button>
       ...
       <div class="header-more" data-nav-more hidden>
         <button class="btn" data-nav-more-btn><i class="fas fa-ellipsis"></i></button>
         <div class="header-more-menu" data-nav-more-list></div>
       </div>
     </div>
     HeaderNav.init();
   ============================================================ */

(function (global) {
  'use strict';

  var HeaderNav = {
    _bar: null,
    _refresh: null,

    /**
     * 初始化（同一页面只需调用一次，重复调用会复用上一次的实例）
     * @param {object} [options]
     * @param {string} [options.barSelector]  导航容器选择器，默认 .nav-bar
     * @param {string} [options.moreSelector] 「更多」容器选择器，默认 [data-nav-more]
     */
    init: function (options) {
      var opts = options || {};
      var bar = document.querySelector(opts.barSelector || '.nav-bar');
      if (!bar || this._bar === bar) return;

      var menu = bar.querySelector(opts.moreSelector || '[data-nav-more]');
      if (!menu) return;

      var menuBtn = menu.querySelector('[data-nav-more-btn]') || menu.querySelector('button');
      var menuList = menu.querySelector('[data-nav-more-list]') || menu.querySelector('.header-more-menu');
      if (!menuBtn || !menuList) return;

      this._bar = bar;

      // 与 CSS 中 .nav-bar 的 gap 保持一致
      var GAP = 4;

      // 参与折叠的单元 = 导航容器的直接子元素（排除「更多」容器与隐藏的文件输入）
      // 常驻元素（data-nav-static，如状态徽章）不参与折叠，但会占用可用宽度
      var staticEls = Array.prototype.slice.call(bar.children)
        .filter(function (el) {
          return el.nodeType === 1 && el !== menu && el.hasAttribute('data-nav-static');
        });

      var units = Array.prototype.slice.call(bar.children)
        .filter(function (el) {
          return el.nodeType === 1 && el !== menu;
        })
        .filter(function (el) {
          return !el.hasAttribute('data-nav-static');
        })
        .filter(function (el) {
          return !(el.tagName === 'INPUT' && el.type === 'file');
        })
        .map(function (el) {
          // 已有的下拉菜单（如「导出」）：自身隐藏，其子项作为菜单条目继续可用
          var innerList = el.classList.contains('header-more')
            ? el.querySelector('.header-more-menu')
            : null;
          if (innerList && innerList.children.length) {
            return { el: el, home: innerList, nodes: Array.prototype.slice.call(innerList.children) };
          }
          return { el: el, home: bar, nodes: [el] };
        });

      var restore = function () {
        // 先把被挪走的子项放回各自的原始容器
        units.forEach(function (u) {
          u.el.classList.remove('header-collapsed');
          if (u.home !== bar) u.nodes.forEach(function (n) { u.home.appendChild(n); });
        });
        // 再按原始顺序把顶层元素插回「更多」之前，保证顺序不错乱
        units.forEach(function (u) {
          if (u.home === bar) bar.insertBefore(u.el, menu);
        });
      };

      var closeMenu = function () {
        menu.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      };

      // 按钮宽度与视口无关（flex: 0 0 auto + nowrap），测量一次即可缓存。
      // 仅在内容变化（字体加载、登录状态切换）时失效重测，避免测量本身触发重排循环。
      var naturalWidths = null;
      var staticWidth = 0;
      var staticCount = 0;
      var menuBtnWidth = 0;
      var currentPlan = 'init';

      var measure = function () {
        restore();
        menu.hidden = true;
        menuList.innerHTML = '';
        closeMenu();
        naturalWidths = units.map(function (u) { return u.el.getBoundingClientRect().width; });
        // 常驻元素恒显示，宽度直接计入预算
        staticWidth = 0;
        staticCount = 0;
        staticEls.forEach(function (el) {
          var w = el.getBoundingClientRect().width;
          if (w > 0) {
            staticWidth += w + GAP;
            staticCount++;
          }
        });
        menu.hidden = false;
        menuBtnWidth = menuBtn.getBoundingClientRect().width;
        menu.hidden = true;
        currentPlan = 'init';
      };

      var applyPlan = function (plan) {
        var key = plan.join(',');
        if (key === currentPlan) return;
        currentPlan = key;

        restore();
        menuList.innerHTML = '';
        closeMenu();

        if (!plan.length) {
          menu.hidden = true;
          return;
        }

        menu.hidden = false;
        // 按页面从左到右的顺序收进菜单，而不是按收集顺序（倒序）
        units.forEach(function (u, i) {
          if (plan.indexOf(i) === -1) return;
          u.el.classList.add('header-collapsed');
          u.nodes.forEach(function (n) { menuList.appendChild(n); });
        });
      };

      var layout = function () {
        if (!bar.isConnected) return;

        // 窄屏下 CSS 允许换行，此时无需折叠
        if (getComputedStyle(bar).flexWrap === 'wrap') {
          applyPlan([]);
          return;
        }

        var available = bar.clientWidth;
        if (!available) return;
        if (!naturalWidths) measure();

        var widths = naturalWidths;
        var visibleCount = widths.filter(function (w) { return w > 0; }).length;
        // 每个可见单元按「宽度 + gap」计入，常驻元素同理
        var unitsTotal = widths.reduce(function (sum, w) { return sum + w; }, 0) +
          GAP * visibleCount;
        var full = staticWidth + unitsTotal;

        if (full <= available) {
          applyPlan([]);
          return;
        }

        // 折叠后仍需保留「更多」按钮及其 gap
        var budget = available - staticWidth - menuBtnWidth - GAP;
        var plan = [];
        for (var i = units.length - 1; i >= 0 && unitsTotal > budget; i--) {
          if (widths[i] <= 0) continue;
          plan.push(i);
          unitsTotal -= widths[i] + GAP;
        }
        applyPlan(plan);
      };

      // ---------- 菜单交互 ----------
      menuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = menu.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', function (e) {
        if (!menu.contains(e.target)) closeMenu();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenu();
      });
      menuList.addEventListener('click', function (e) {
        if (e.target.closest('button')) closeMenu();
      });

      // ---------- 调度 ----------
      // 用 setTimeout 而非 rAF：后台标签页中 rAF 会被节流甚至不触发。
      // 不要重置已排队的定时器，否则连续触发时可能永远等不到执行。
      var timer = null;
      var schedule = function () {
        if (timer) return;
        timer = setTimeout(function () { timer = null; layout(); }, 60);
      };

      var relayout = function () { schedule(); };
      var remeasure = function () {
        naturalWidths = null;
        schedule();
      };

      if (global.ResizeObserver) new global.ResizeObserver(relayout).observe(bar);
      global.addEventListener('resize', relayout);

      if (document.readyState === 'complete') {
        remeasure();
      } else {
        global.addEventListener('load', remeasure);
      }

      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(remeasure);
      }

      // 标签页重新可见时立即重算（后台标签页中事件会被节流）
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) relayout();
      });

      // 兜底轮询：后台标签页中 ResizeObserver / resize 可能被节流，
      // 这里用极轻量的宽度比对保证折叠状态始终正确
      var lastSeenWidth = -1;
      setInterval(function () {
        if (!bar.isConnected) return;
        var w = bar.clientWidth;
        if (w === lastSeenWidth) return;
        lastSeenWidth = w;
        relayout();
      }, 400);

      this._refresh = remeasure;
      schedule();
    },

    /** 登录状态切换、按钮增减后调用，重新测量并布局 */
    refresh: function () {
      if (this._refresh) this._refresh();
    }
  };

  global.HeaderNav = HeaderNav;

})(window);
