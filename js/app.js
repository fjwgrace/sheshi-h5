// 应用核心：图库三品类列表 + 详情瀑布流（规格来自首个 txt）
(function() {
  'use strict';

  var DETAIL_BATCH = 12;

  var state = {
    currentView: 'home',
    previousView: null,
    detailObserver: null,
    listCuratedFooterObserver: null,
    listFullCatalog: false,
  };

  function categoriesSource() {
    return typeof GALLERY_CATEGORIES !== 'undefined' && Array.isArray(GALLERY_CATEGORIES)
      ? GALLERY_CATEGORIES
      : [];
  }

  function curatedFoldersOrder() {
    return typeof GALLERY_CURATED_FOLDERS !== 'undefined' && Array.isArray(GALLERY_CURATED_FOLDERS)
      ? GALLERY_CURATED_FOLDERS
      : [];
  }

  function curatedCategoriesList() {
    var order = curatedFoldersOrder();
    if (!order.length) return [];
    var map = {};
    categoriesSource().forEach(function(c) {
      map[c.folder] = c;
    });
    var out = [];
    order.forEach(function(folder) {
      if (map[folder]) out.push(map[folder]);
    });
    return out;
  }

  function filterCategoriesByQuery(all, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return all.slice();
    return all.filter(function(c) {
      if (c.folder.toLowerCase().includes(q)) return true;
      var meta = metaForFolder(c.folder);
      if (!meta) return false;
      return (meta.nameEn && meta.nameEn.toLowerCase().includes(q)) ||
        meta.origin.toLowerCase().includes(q) ||
        meta.type.toLowerCase().includes(q) ||
        (meta.description && meta.description.toLowerCase().includes(q));
    });
  }

  function teardownListCuratedFooter() {
    if (state.listCuratedFooterObserver) {
      state.listCuratedFooterObserver.disconnect();
      state.listCuratedFooterObserver = null;
    }
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function metaForFolder(folder) {
    if (typeof STONES === 'undefined' || !STONES.length) return null;
    for (var i = 0; i < STONES.length; i++) {
      if (STONES[i].name === folder) return STONES[i];
    }
    return null;
  }

  function thicknessFromSpecDisplay(display) {
    if (!display) return null;
    var m = String(display).match(/(\d+(?:\.\d+)?)\s*mm\s*$/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    return isNaN(n) ? null : n;
  }

  function specSummaryLine(specs) {
    if (!specs || !specs.length) return '';
    var parts = ['共 ' + specs.length + ' 条编号'];
    var thicks = [];
    specs.forEach(function(s) {
      var t = thicknessFromSpecDisplay(s.specDisplay);
      if (t !== null) thicks.push(t);
    });
    if (thicks.length) {
      var mn = Math.min.apply(null, thicks);
      var mx = Math.max.apply(null, thicks);
      parts.push(mn === mx ? '厚 ' + mn + ' mm' : '厚 ' + mn + '–' + mx + ' mm');
    }
    return parts.join(' · ');
  }

  function teardownDetailLoader() {
    if (state.detailObserver) {
      state.detailObserver.disconnect();
      state.detailObserver = null;
    }
  }

  function syncListCuratedFooter(options) {
    var footer = document.getElementById('list-curated-footer');
    var btn = document.getElementById('btn-view-all-stones');
    var hint = document.getElementById('list-curated-hint');
    var sentinel = document.getElementById('list-curated-sentinel');
    teardownListCuratedFooter();

    var opts = options || {};
    var showChrome = opts.curatedMode && !opts.searchQuery && curatedFoldersOrder().length > 0 && !state.listFullCatalog;

    if (!footer || !btn || !sentinel) return;

    if (!showChrome) {
      footer.setAttribute('hidden', '');
      btn.setAttribute('hidden', '');
      if (hint) hint.setAttribute('hidden', '');
      return;
    }

    footer.removeAttribute('hidden');
    btn.setAttribute('hidden', '');
    if (hint) {
      hint.removeAttribute('hidden');
      hint.textContent = '向下滑动，浏览全部精选品类';
    }

    btn.onclick = function() {
      state.listFullCatalog = true;
      var all = categoriesSource();
      var si = document.getElementById('search-input');
      var query = (si && si.value) ? si.value.trim().toLowerCase() : '';
      var display = query ? filterCategoriesByQuery(all, query) : all;
      renderCategoryList(display, {
        curatedMode: false,
        totalCount: all.length,
        searchQuery: query,
      });
      window.scrollTo(0, 0);
    };

    if ('IntersectionObserver' in window) {
      state.listCuratedFooterObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            btn.removeAttribute('hidden');
            if (hint) hint.setAttribute('hidden', '');
          }
        });
      }, { root: null, rootMargin: '100px', threshold: 0 });
      state.listCuratedFooterObserver.observe(sentinel);
    } else {
      btn.removeAttribute('hidden');
      if (hint) hint.setAttribute('hidden', '');
    }
  }

  function renderCategoryList(list, renderOpts) {
    var ro = renderOpts || {};
    var container = document.getElementById('stone-list');
    var countEl = document.getElementById('list-count');
    var emptyEl = document.getElementById('list-empty');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      if (countEl) {
        countEl.textContent = ro.searchQuery ? '找到 0 种' : '0 种奢石';
      }
      syncListCuratedFooter(ro);
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (countEl) {
      if (ro.curatedMode && !ro.searchQuery && typeof ro.totalCount === 'number') {
        countEl.textContent = '精选 ' + list.length + ' · 库内共 ' + ro.totalCount + ' 种';
      } else if (ro.searchQuery) {
        countEl.textContent = '找到 ' + list.length + ' 种';
      } else {
        countEl.textContent = list.length + ' 种奢石';
      }
    }

    container.innerHTML = list.map(function(c) {
      var meta = metaForFolder(c.folder);
      var metaLine;
      if (meta) {
        var desc = meta.description || '';
        if (desc.length > 28) desc = desc.slice(0, 28) + '…';
        metaLine = escapeHtml(meta.origin + ' · ' + meta.type + (desc ? ' · ' + desc : ''));
      } else {
        var bits = [];
        if (c.images && c.images.length) bits.push(c.images.length + ' 张图');
        else bits.push('暂无图片');
        if (c.specs && c.specs.length) bits.push(c.specs.length + ' 条编号');
        metaLine = escapeHtml(bits.join(' · '));
      }

      var thumb = (c.images && c.images.length)
        ? '<img class="stone-card-thumb" src="' + escapeAttr(c.images[0]) + '" alt="" loading="lazy">'
        : '<div class="stone-card-thumb img-placeholder" role="presentation"></div>';

      return '<div class="stone-card" data-folder="' + escapeAttr(c.folder) + '">' +
        thumb +
        '<div class="stone-card-info">' +
          '<div class="stone-card-name">' + escapeHtml(c.folder) + '</div>' +
          '<div class="stone-card-meta">' + metaLine + '</div>' +
        '</div>' +
        '<span class="stone-card-arrow">→</span>' +
      '</div>';
    }).join('');

    container.querySelectorAll('.stone-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var folder = this.getAttribute('data-folder');
        navigateTo('detail', folder);
      });
    });

    syncListCuratedFooter(ro);
  }

  function navigateTo(viewName, folderName, navOpts) {
    var no = navOpts || {};
    if (state.currentView === 'detail' && viewName !== 'detail') {
      teardownDetailLoader();
    }
    if (state.currentView === 'list' && viewName !== 'list') {
      teardownListCuratedFooter();
    }

    state.previousView = state.currentView;
    state.currentView = viewName;

    document.querySelectorAll('.view').forEach(function(v) {
      v.classList.remove('active');
      v.style.display = 'none';
    });

    var target = document.getElementById('view-' + viewName);
    if (target) {
      target.style.display = '';
      void target.offsetWidth;
      target.classList.add('active');
    }

    window.scrollTo(0, 0);

    if (viewName === 'list') {
      if (no.resetListMode) {
        state.listFullCatalog = false;
      }
      if (no.clearSearch) {
        var siClear = document.getElementById('search-input');
        if (siClear) siClear.value = '';
        var scClear = document.getElementById('search-clear');
        if (scClear) scClear.style.display = 'none';
      }

      var all = categoriesSource();
      var si = document.getElementById('search-input');
      var query = (si && si.value) ? si.value.trim().toLowerCase() : '';
      if (query) {
        var filtered = filterCategoriesByQuery(all, query);
        renderCategoryList(filtered, {
          curatedMode: false,
          totalCount: all.length,
          searchQuery: query,
        });
      } else {
        var curated = curatedCategoriesList();
        var useCurated = curated.length > 0 && !state.listFullCatalog;
        var list = useCurated ? curated : all;
        renderCategoryList(list, {
          curatedMode: useCurated,
          totalCount: all.length,
          searchQuery: '',
        });
      }
    } else if (viewName === 'detail' && folderName) {
      renderDetail(folderName);
    }
  }

  function renderDetail(folderName) {
    teardownDetailLoader();

    var cat = categoriesSource().find(function(c) { return c.folder === folderName; });
    if (!cat) return;

    var container = document.getElementById('detail-content');
    if (!container) return;

    var meta = metaForFolder(cat.folder);
    var title = escapeHtml(cat.folder);
    var sub = meta
      ? escapeHtml((meta.nameEn || '') + ' · ' + meta.origin + ' · ' + meta.type)
      : '';

    var specBlockHtml = '';
    if (cat.specs && cat.specs.length) {
      var sum = escapeHtml(specSummaryLine(cat.specs));
      var rows = cat.specs.map(function(s) {
        return '<tr><td class="spec-code">' + escapeHtml(s.code) + '</td>' +
          '<td class="spec-dim">' + escapeHtml(s.specDisplay) + '</td></tr>';
      }).join('');
      specBlockHtml =
        '<div class="detail-spec-block">' +
          '<button type="button" class="spec-toggle" id="spec-toggle" aria-expanded="false">' +
            '<span class="spec-toggle-title">规格与编号</span>' +
            '<span class="spec-toggle-summary">' + sum + '</span>' +
            '<span class="spec-chevron" aria-hidden="true">▼</span>' +
          '</button>' +
          '<div class="spec-panel" id="spec-panel" hidden>' +
            '<table class="spec-table"><tbody>' + rows + '</tbody></table>' +
          '</div>' +
        '</div>';
    }

    var descHtml = '';
    if (meta && meta.description) {
      descHtml = '<p class="detail-desc">' + escapeHtml(meta.description) + '</p>';
    }

    container.innerHTML =
      '<div class="detail-header">' +
        '<div class="detail-name">' + title + '</div>' +
        (sub ? '<div class="detail-meta">' + sub + '</div>' : '') +
      '</div>' +
      descHtml +
      specBlockHtml +
      '<div class="detail-section detail-gallery-section">' +
        '<div class="section-label">图集</div>' +
        '<div id="detail-masonry" class="masonry"></div>' +
        '<div class="masonry-foot">' +
          '<div id="detail-masonry-sentinel" class="masonry-sentinel"></div>' +
          '<p id="detail-masonry-status" class="masonry-status"></p>' +
        '</div>' +
      '</div>';

    var toggle = document.getElementById('spec-toggle');
    var panel = document.getElementById('spec-panel');
    if (toggle && panel) {
      toggle.addEventListener('click', function() {
        var open = panel.hasAttribute('hidden');
        if (open) {
          panel.removeAttribute('hidden');
          toggle.setAttribute('aria-expanded', 'true');
          toggle.classList.add('open');
        } else {
          panel.setAttribute('hidden', '');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.classList.remove('open');
        }
      });
    }

    var masonry = document.getElementById('detail-masonry');
    var statusEl = document.getElementById('detail-masonry-status');
    var sentinel = document.getElementById('detail-masonry-sentinel');
    var images = cat.images || [];
    var shown = 0;

    function setStatus(text) {
      if (statusEl) statusEl.textContent = text;
    }

    function appendBatch() {
      if (!masonry) return;
      if (shown >= images.length) return;
      var slice = images.slice(shown, shown + DETAIL_BATCH);
      shown += slice.length;
      slice.forEach(function(src) {
        var wrap = document.createElement('div');
        wrap.className = 'masonry-item';
        var img = document.createElement('img');
        img.src = src;
        img.alt = cat.folder;
        img.loading = 'lazy';
        img.className = 'masonry-img';
        wrap.appendChild(img);
        masonry.appendChild(wrap);
      });

      if (shown >= images.length) {
        setStatus(images.length ? '已加载全部 ' + images.length + ' 张' : '');
        if (state.detailObserver && sentinel) {
          state.detailObserver.unobserve(sentinel);
        }
      } else {
        setStatus('已加载 ' + shown + ' / ' + images.length + ' 张');
      }
    }

    if (!images.length) {
      masonry.innerHTML = '<p class="detail-empty-gallery">该品类文件夹中暂无图片，添加图片后运行 npm run build:gallery 更新目录。</p>';
      if (sentinel) sentinel.style.display = 'none';
      setStatus('');
      return;
    }

    appendBatch();

    if (shown < images.length && sentinel && 'IntersectionObserver' in window) {
      state.detailObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) appendBatch();
        });
      }, { root: null, rootMargin: '240px', threshold: 0 });
      state.detailObserver.observe(sentinel);
    } else {
      setStatus('已加载全部 ' + images.length + ' 张');
    }
  }

  function applyHomeHero() {
    var hero = document.querySelector('.home-hero-img');
    if (!hero || hero.tagName !== 'IMG') return;

    var raw = hero.getAttribute('src');
    var preferred = (raw !== null && String(raw).trim() !== '')
      ? String(raw).trim()
      : 'images/home-hero.jpg';
    var gallery = (typeof GALLERY_HOME_HERO === 'string' && GALLERY_HOME_HERO) ? GALLERY_HOME_HERO : '';

    var triedGallery = false;
    function onLoad() {
      hero.classList.remove('img-placeholder');
    }
    function onError() {
      if (!triedGallery && gallery) {
        triedGallery = true;
        hero.src = gallery;
        return;
      }
      hero.classList.add('img-placeholder');
      hero.removeEventListener('error', onError);
    }

    hero.addEventListener('load', onLoad);
    hero.addEventListener('error', onError);
    hero.src = preferred;
  }

  document.addEventListener('DOMContentLoaded', function() {
    applyHomeHero();

    var btnEnter = document.getElementById('btn-enter');
    if (btnEnter) {
      btnEnter.addEventListener('click', function() {
        navigateTo('list', null, { resetListMode: true, clearSearch: true });
      });
    }

    var btnHome = document.getElementById('btn-home');
    if (btnHome) {
      btnHome.addEventListener('click', function() {
        navigateTo('home');
      });
    }

    var searchInput = document.getElementById('search-input');
    var searchClear = document.getElementById('search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        var query = this.value.trim().toLowerCase();
        if (searchClear) searchClear.style.display = query ? 'block' : 'none';
        var all = categoriesSource();
        if (!query) {
          var curated = curatedCategoriesList();
          var useCurated = curated.length > 0 && !state.listFullCatalog;
          var list = useCurated ? curated : all;
          renderCategoryList(list, {
            curatedMode: useCurated,
            totalCount: all.length,
            searchQuery: '',
          });
          return;
        }
        var filtered = filterCategoriesByQuery(all, query);
        renderCategoryList(filtered, {
          curatedMode: false,
          totalCount: all.length,
          searchQuery: query,
        });
      });

      if (searchClear) {
        searchClear.addEventListener('click', function() {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input'));
          searchInput.focus();
        });
      }
    }

    var btnBack = document.getElementById('btn-back');
    if (btnBack) {
      btnBack.addEventListener('click', function() {
        navigateTo('list');
      });
    }

    function copyText(text) {
      if (!text) return Promise.reject(new Error('empty'));
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function(resolve, reject) {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          ta.style.top = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          var ok = document.execCommand('copy');
          ta.remove();
          ok ? resolve() : reject(new Error('copy failed'));
        } catch (e) {
          reject(e);
        }
      });
    }

    document.querySelectorAll('[data-copy]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var value = this.getAttribute('data-copy') || '';
        var actionEl = this.querySelector('.contact-chip-action');
        var original = actionEl ? actionEl.textContent : '';
        copyText(value).then(function() {
          if (actionEl) actionEl.textContent = '已复制';
          setTimeout(function() {
            if (actionEl) actionEl.textContent = original || '点击复制';
          }, 1200);
        }).catch(function() {
          if (actionEl) actionEl.textContent = '复制失败';
          setTimeout(function() {
            if (actionEl) actionEl.textContent = original || '点击复制';
          }, 1200);
        });
      });
    });

    var touchStartY = 0;
    document.addEventListener('touchstart', function(e) {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
      if (state.currentView === 'home') {
        var deltaY = touchStartY - e.changedTouches[0].clientY;
        if (deltaY > 60) {
          navigateTo('list', null, { resetListMode: true, clearSearch: true });
        }
      }
    });

    document.addEventListener('click', function(e) {
      if (e.target.tagName === 'IMG' && e.target.closest('#view-detail')) {
        if (e.target.closest('.lightbox')) return;
        var src = e.target.src;
        if (!src) return;
        var lb = document.createElement('div');
        lb.className = 'lightbox';
        lb.innerHTML = '<button type="button" class="lightbox-close" aria-label="关闭">&times;</button><img src="' +
          escapeAttr(src) + '" alt="">';
        document.body.appendChild(lb);
        requestAnimationFrame(function() { lb.classList.add('open'); });
        lb.addEventListener('click', function(ev) {
          if (ev.target === lb || ev.target.classList.contains('lightbox-close')) {
            lb.classList.remove('open');
            setTimeout(function() { lb.remove(); }, 250);
          }
        });
      }
    });
  });
})();
