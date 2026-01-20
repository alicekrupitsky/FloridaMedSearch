function buildActionUrl(action){
    // Keeps existing query params (e.g., showSql=1) but forces action=...
    try{
        var u = new URL(window.location.href);
        u.searchParams.set('action', action);
        u.hash = '';
        return u.toString();
    }catch(e){
        // Fallback: keep existing params except action
        var qs = (window.location.search || '').replace(/^\?/, '');
        var kept = [];
        if(qs){
            qs.split('&').forEach(function(p){
                if(!p) return;
                var k = (p.split('=')[0] || '').toLowerCase();
                if(k !== 'action') kept.push(p);
            });
        }
        kept.unshift('action=' + encodeURIComponent(action));
        return window.location.pathname + '?' + kept.join('&');
    }
}

$(function(){
    var modal = new bootstrap.Modal(document.getElementById('icdModal'));
    var MED_IS_AUTH = !!(document.body && document.body.getAttribute('data-is-auth') === '1');

    function wireIcdSearchUnlock(table){
        if(!table || !table.table) return;
        var $input = $('div.dataTables_filter input', table.table().container());
        if(!$input.length) return;

        // If we applied an exact (column) filter to pre-focus a single selected code,
        // remove that exact filter as soon as the user edits the search box.
        $input.off('.icdUnlock');
        $input.on('input.icdUnlock keyup.icdUnlock search.icdUnlock', function(){
            var lock = table._exactProcCodeLock;
            if(!lock) return;
            var v = (($(this).val() || '').toString().trim()).toUpperCase();
            if(v === lock) return;

            table._exactProcCodeLock = null;
            table.column(2).search('', true, false);
            // DataTables' own handler is bound before ours; it may have already
            // redrawn using the old column filter. Force a redraw to apply unlock.
            table.draw();
        });
    }

    function escapeRegex(text){
        return (text || '').toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function getSelectedIcdProcedureCodes(){
        // Reads the form field value (comma-separated) and returns unique, trimmed codes.
        var raw = ($('input[name="icd"]').val() || '').toString();
        var parts = raw.split(',').map(function(s){ return (s || '').toString().trim(); }).filter(Boolean);
        var seen = {};
        var uniq = [];
        for(var i = 0; i < parts.length; i++){
            var code = parts[i];
            var key = code.toUpperCase();
            if(!seen[key]){
                seen[key] = true;
                uniq.push(code);
            }
        }
        return uniq;
    }

    function applySingleSelectedProcedureFilter(table){
        if(!table) return;

        var codes = getSelectedIcdProcedureCodes();
        var hasSingle = (codes.length === 1);

        // Column 1 is procCode in this DataTable.
        if(hasSingle){
            var code = codes[0];
            table._exactProcCodeLock = (code || '').toString().trim().toUpperCase();
            // Column 2 is procCode (after checkbox + star columns)
            table.column(2).search('^' + escapeRegex(code) + '$', true, false);
            table.search(code);
            try{ $('#icdTable_filter input').val(code); }catch(e){}
        }else{
            table._exactProcCodeLock = null;
            table.column(2).search('', true, false);
            table.search('');
            try{ $('#icdTable_filter input').val(''); }catch(e){}
        }
    }

    // Cache ICD-10 procedure JSON for 7 days to avoid repeated downloads.
    var ICD_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    var ICD_CACHE_KEY_PREFIX = 'MED.icdProcedures.cache.v1.';

    function hasLocalStorage(){
        try{
            var k = '__ls_test__';
            localStorage.setItem(k, '1');
            localStorage.removeItem(k);
            return true;
        }catch(e){
            return false;
        }
    }

    function hashString(str){
        // Small deterministic hash to keep localStorage keys short.
        var h = 5381;
        for(var i = 0; i < str.length; i++){
            h = ((h << 5) + h) + str.charCodeAt(i);
            h = h | 0;
        }
        return (h >>> 0).toString(36);
    }

    function getCacheKeyForUrl(url){
        return ICD_CACHE_KEY_PREFIX + hashString(url);
    }

    function readCachedJson(url){
        if(!hasLocalStorage()) return null;
        try{
            var key = getCacheKeyForUrl(url);
            var raw = localStorage.getItem(key);
            if(!raw) return null;
            var obj = JSON.parse(raw);
            if(!obj || typeof obj !== 'object') return null;
            if(obj.url !== url) return null;
            if(!obj.ts || (Date.now() - obj.ts) > ICD_CACHE_TTL_MS) return null;
            return obj.payload || null;
        }catch(e){
            return null;
        }
    }

    function writeCachedJson(url, payload){
        if(!hasLocalStorage()) return;
        try{
            var key = getCacheKeyForUrl(url);
            var obj = { ts: Date.now(), url: url, payload: payload };
            localStorage.setItem(key, JSON.stringify(obj));
        }catch(e){
            // ignore (quota, blocked, etc.)
        }
    }

    function normalizeProcedureJsonToRows(json){
        if(!json) return [];
        if(json.error){
            console.error('Procedure data error', json);
            alert('Procedure data error: ' + (json.message || 'unknown'));
            return [];
        }
        if(Array.isArray(json)) return json;
        if(json && Array.isArray(json.data)) return json.data;
        for(var k in json){
            if(Object.prototype.hasOwnProperty.call(json, k) && Array.isArray(json[k])) return json[k];
        }
        return [];
    }

    function fetchProcedureJson(done){
        var dataUrl = buildActionUrl('data');

        // The JSON includes per-user isStarred. Avoid caching when authenticated
        // so localStorage doesn't show stale stars.
        var canCache = !MED_IS_AUTH;

        if(canCache){
            var cached = readCachedJson(dataUrl);
            if(cached){
                done(cached, true);
                return;
            }
        }

        $.ajax({
            url: dataUrl,
            type: 'GET',
            dataType: 'json',
            cache: true
        }).done(function(json){
            // Only cache valid-looking JSON responses.
            if(canCache && json && !json.error){
                writeCachedJson(dataUrl, json);
            }
            done(json, false);
        }).fail(function(xhr, status, err){
            if(status === 'abort' || (xhr && xhr.statusText && xhr.statusText.toLowerCase() === 'abort')){
                console.warn('Procedure data AJAX aborted');
                done(null, false);
                return;
            }
            try{
                console.error('AJAX error', status, err, xhr && xhr.responseText);
                alert('AJAX error loading procedure data: ' + (xhr && xhr.status ? xhr.status + ': ' : '') + (xhr && (xhr.statusText || xhr.responseText) ? (xhr.statusText || xhr.responseText) : status));
            }catch(e){
                alert('AJAX error loading procedure data');
            }
            done(null, false);
        });
    }

    function formatUseCount(value){
        var n = parseInt(value, 10);
        if(isNaN(n)) n = 0;
        try{ return n.toLocaleString('en-US'); }catch(e){ return String(n); }
    }

    function renderProcStarButton(isStarred, procCode){
        var starred = !!isStarred;
        var icon = starred ? 'bi-star-fill' : 'bi-star';
        var cls = starred ? 'text-warning' : 'text-muted';
        var aria = starred ? 'Unstar procedure' : 'Star procedure';
        var safeProc = $('<div/>').text(procCode || '').html();
        return "<button type='button' class='proc-star-btn' data-proc='" + safeProc + "' aria-label='" + aria + "' aria-pressed='" + (starred ? 'true' : 'false') + "'>" +
            "<i class='bi " + icon + " " + cls + "' aria-hidden='true'></i>" +
            "</button>";
    }

    $('#openSearch').on('click', function(){
        modal.show();
        if(!$.fn.dataTable.isDataTable('#icdTable')){
            // Show the star-only toggle only when stars are meaningful.
            try{ $('#icdStarOnlyWrap').toggle(!!MED_IS_AUTH); }catch(_e){}

            var table = $('#icdTable').DataTable({
                ajax: function(_data, callback, _settings){
                    fetchProcedureJson(function(json){
                        var rows = normalizeProcedureJsonToRows(json);
                        callback({ data: rows });
                    });
                },
                columns: [
                    { data: null, orderable:false, searchable:false, width:'4%', render: function(){ return '<input type="checkbox" class="icd-select" />'; } },
                    { data: 'isStarred', visible: MED_IS_AUTH, orderable:false, searchable:false, width:'4%', render: function(d, _t, row){ return renderProcStarButton(d, row && row.procCode); } },
                    { data: 'procCode', width: '12%', render: function(d){ return '<strong>'+(d || '')+'</strong>'; } },
                    { data: 'description', width: '60%', render: function(d){ return '<div style="white-space:normal;word-break:break-word;">'+(d || '')+'</div>'; } },
                    { data: 'use_count', width: '10%', render: function(d){ return formatUseCount(d); } }
                ],
                responsive: false,
                deferRender: true,
                processing: true,
                language: {
                    processing: ' '
                },
                // Remove DataTables Buttons (Copy/CSV) from the ICD modal.
                dom: "<'row'<'col-sm-6'><'col-sm-6'f>>rt<'row'<'col-sm-6'i><'col-sm-6'p>>",
                pageLength: 30,
                order: [[2,'asc']],
                createdRow: function(row,data){
                    $(row).attr('data-icd', data.procCode);
                }
            });

            wireIcdSearchUnlock(table);

            var populateFilters = function(json){
                var data = Array.isArray(json) ? json : (json && Array.isArray(json.data) ? json.data : []);
                var sections = {};
                $('#icdSection').empty().append('<option value="">-- all sections --</option>');
                $('#icdSubsection').empty().append('<option value="">-- all subsections --</option>');
                for(var i=0;i<data.length;i++){
                    var r = data[i] || {};
                    var sec = (r.category || '').toString();
                    var sub = (r.subcategory || '').toString();
                    if(sec){ if(!sections[sec]) sections[sec] = {}; }
                    if(sec && sub){ sections[sec][sub] = true; }
                }
                Object.keys(sections).sort().forEach(function(s){ $('#icdSection').append($('<option>').val(s).text(s)); });
                $('#icdSection').data('map', sections);
            };

            table.on('xhr', function(){ var json = table.ajax.json(); populateFilters(json); table.draw(); });

            $.fn.dataTable.ext.search = $.fn.dataTable.ext.search.filter(function(fn){
                return !(fn && fn._icdTableFilter);
            });

            var icdTableFilter = function(settings, data, dataIndex){
                if(settings.nTable.id !== 'icdTable') return true;
                var selSec = $('#icdSection').val();
                var selSub = $('#icdSubsection').val();
                var starOnly = !!(MED_IS_AUTH && $('#icdStarOnly').is(':checked'));
                var row = table.row(dataIndex).data();
                if(!row) return true;
                if(selSec && (row.category || '') !== selSec) return false;
                if(selSub && (row.subcategory || '') !== selSub) return false;
                if(starOnly && !row.isStarred) return false;
                return true;
            };
            icdTableFilter._icdTableFilter = true;
            $.fn.dataTable.ext.search.push(icdTableFilter);

            $('#icdSection').on('change', function(){
                var map = $(this).data('map') || {};
                var sec = $(this).val();
                $('#icdSubsection').empty().append('<option value="">-- all subsections --</option>');
                if(sec && map[sec]){
                    Object.keys(map[sec]).sort().forEach(function(sub){ $('#icdSubsection').append($('<option>').val(sub).text(sub)); });
                }
                table.draw();
            });

            $('#icdSubsection').on('change', function(){ table.draw(); });

            // Star-only filter toggle.
            $('#icdStarOnly').on('change', function(){ table.draw(); });

            document.getElementById('icdModal').addEventListener('shown.bs.modal', function(){
                $('#icdSection').val('');
                $('#icdSubsection').val('');
                applySingleSelectedProcedureFilter(table);
                wireIcdSearchUnlock(table);
                table.draw();
            });

            $('#icdTable tbody').on('change', '.icd-select', function(e){
                var tr = $(this).closest('tr');
                if(this.checked){ tr.addClass('table-active'); }
                else { tr.removeClass('table-active'); }
            });

            $('#icdTable tbody').on('click', '.proc-star-btn', function(e){
                e.preventDefault();
                e.stopPropagation();

                var $btn = $(this);
                var proc = ($btn.attr('data-proc') || '').toString().trim();
                if(!proc) return;

                $btn.prop('disabled', true);

                $.ajax({
                    url: buildActionUrl('toggleProcStar'),
                    type: 'POST',
                    dataType: 'json',
                    data: { procCode: proc },
                    success: function(json){
                        if(!json || json.error){
                            console.error('toggleProcStar error', json);
                            return;
                        }

                        var starred = !!json.isStarred;
                        var $icon = $btn.find('i.bi');
                        if($icon.length){
                            $icon.removeClass('bi-star bi-star-fill text-muted text-warning');
                            $icon.addClass(starred ? 'bi-star-fill text-warning' : 'bi-star text-muted');
                        }
                        $btn.attr('aria-pressed', starred ? 'true' : 'false');
                        $btn.attr('aria-label', starred ? 'Unstar procedure' : 'Star procedure');

                        try{
                            var tr = $btn.closest('tr');
                            var row = table.row(tr);
                            var data = row.data();
                            if(data){
                                data.isStarred = starred;
                                row.data(data);
                            }
                        }catch(_e){}

                        // If "show starred only" is enabled, re-apply the filter.
                        try{ table.draw(false); }catch(_e){}
                    },
                    error: function(xhr){
                        if(xhr && xhr.status === 401){
                            alert('Please sign in to star procedures.');
                            return;
                        }
                        console.error('toggleProcStar ajax error', xhr && xhr.status, xhr && xhr.responseText);
                    },
                    complete: function(){
                        $btn.prop('disabled', false);
                    }
                });
            });

            $(document).on('click', '#applyIcdSelected', function(){
                var vals = [];
                $('#icdTable tbody .icd-select:checked').each(function(){
                    var code = $(this).closest('tr').attr('data-icd');
                    if(code) vals.push(code);
                });
                $('input[name="icd"]').val(vals.join(','));
                modal.hide();
            });

            // Initial open: if exactly one code is already selected, filter the table.
            applySingleSelectedProcedureFilter(table);
            wireIcdSearchUnlock(table);
            table.draw();
        }else{
            // Re-run the loader (will hit localStorage cache when available).
            var dt = $('#icdTable').DataTable();

            // Show the star-only toggle only when stars are meaningful.
            try{ $('#icdStarOnlyWrap').toggle(!!MED_IS_AUTH); }catch(_e){}

            applySingleSelectedProcedureFilter(dt);
            wireIcdSearchUnlock(dt);
            dt.ajax.reload(function(){ dt.draw(); }, false);
        }
    });
});

$(document).ready(function() {
    $('#county').select2({
        placeholder: 'Select counties',
        allowClear: true
    });

    // Star doctors (premium users only; buttons are only rendered when authenticated)
    $(document).on('click', '.doc-star-btn', function (e) {
        e.preventDefault();
        e.stopPropagation();

        var $btn = $(this);
        var lic = ($btn.attr('data-license') || '').toString().trim();
        if (!lic) return;

        $btn.prop('disabled', true);

        $.ajax({
            url: 'md.aspx?action=toggleStar',
            type: 'POST',
            dataType: 'json',
            data: { license: lic },
            success: function (json) {
                if (!json || json.error) {
                    console.error('toggleStar error', json);
                    return;
                }

                var starred = !!json.isStarred;
                var $icon = $btn.find('i.bi');
                if ($icon.length) {
                    $icon.removeClass('bi-star bi-star-fill text-muted text-warning');
                    $icon.addClass(starred ? 'bi-star-fill text-warning' : 'bi-star text-muted');
                }
                $btn.attr('aria-pressed', starred ? 'true' : 'false');
                $btn.attr('aria-label', starred ? 'Unstar doctor' : 'Star doctor');
            },
            error: function (xhr) {
                console.error('toggleStar ajax error', xhr && xhr.status, xhr && xhr.responseText);
            },
            complete: function () {
                $btn.prop('disabled', false);
            }
        });
    });

    // Persist ICD-10 procedure selections.
    (function(){
        var KEY_ICD = 'MED.icdProcedures.selectedCodes';

        function hasLocalStorage(){
            try{
                var k = '__ls_test__';
                localStorage.setItem(k, '1');
                localStorage.removeItem(k);
                return true;
            }catch(e){
                return false;
            }
        }

        function saveIcd(){
            if(!hasLocalStorage()) return;
            try{
                var raw = ($('input[name="icd"]').val() || '').toString().trim();
                if(raw){ localStorage.setItem(KEY_ICD, raw); }
                else { localStorage.removeItem(KEY_ICD); }
            }catch(e){
                // ignore
            }
        }

        function loadIcd(){
            if(!hasLocalStorage()) return;
            try{
                var $icd = $('input[name="icd"]');
                if(!$icd.length) return;
                var cur = ($icd.val() || '').toString().trim();
                if(cur.length) return; // don't override server-provided / user-provided values
                var saved = (localStorage.getItem(KEY_ICD) || '').toString().trim();
                if(saved.length) $icd.val(saved);
            }catch(e){
                // ignore
            }
        }

        loadIcd();
        $(document).on('input change blur', 'input[name="icd"]', saveIcd);
        $(document).on('click', '#applyIcdSelected', saveIcd);
        $('#searchForm').on('submit', saveIcd);
    })();

    // Persist County + Center ZIP selections.
    (function(){
        var KEY_COUNTY = 'MED.location.counties';
        var KEY_CENTER_ZIP = 'MED.location.centerZip';
        var KEY_RADIUS_MILES = 'MED.location.radiusMiles';

        function hasLocalStorage(){
            try{
                var k = '__ls_test__';
                localStorage.setItem(k, '1');
                localStorage.removeItem(k);
                return true;
            }catch(e){
                return false;
            }
        }

        function readJsonArray(key){
            try{
                var raw = localStorage.getItem(key);
                if(!raw) return [];
                var val = JSON.parse(raw);
                return Array.isArray(val) ? val : [];
            }catch(e){
                return [];
            }
        }

        function saveSelections(){
            if(!hasLocalStorage()) return;
            try{
                var counties = $('#county').val() || [];
                localStorage.setItem(KEY_COUNTY, JSON.stringify(counties));

                var centerZip = ($('#centerZip').val() || '').toString().trim();
                if(centerZip){ localStorage.setItem(KEY_CENTER_ZIP, centerZip); }
                else { localStorage.removeItem(KEY_CENTER_ZIP); }

                var radiusMiles = ($('#radiusMiles').val() || '').toString().trim();
                if(radiusMiles){ localStorage.setItem(KEY_RADIUS_MILES, radiusMiles); }
                else { localStorage.removeItem(KEY_RADIUS_MILES); }
            }catch(e){
                // ignore
            }
        }

        function loadSelections(){
            if(!hasLocalStorage()) return;
            try{
                // Only hydrate if the user hasn't already selected values this request.
                var currentCounties = $('#county').val();
                if(!currentCounties || currentCounties.length === 0){
                    var savedCounties = readJsonArray(KEY_COUNTY);
                    if(savedCounties.length){
                        $('#county').val(savedCounties).trigger('change');
                    }
                }

                var $cz = $('#centerZip');
                if($cz.length && (($cz.val() || '').toString().trim().length === 0)){
                    var savedZip = localStorage.getItem(KEY_CENTER_ZIP);
                    if(savedZip){ $cz.val(savedZip); }
                }

                var $rm = $('#radiusMiles');
                if($rm.length){
                    var savedRadius = localStorage.getItem(KEY_RADIUS_MILES);
                    var currentRadius = ($rm.val() || '').toString().trim();
                    var defaultRadius = ($rm.prop('defaultValue') || '').toString().trim();
                    // Only hydrate when the current value is still the page default.
                    if(savedRadius && currentRadius === defaultRadius){
                        $rm.val(savedRadius).trigger('input');
                    }
                }
            }catch(e){
                // ignore
            }
        }

        loadSelections();

        $('#county').on('change', saveSelections);
        $('#centerZip').on('input change blur', saveSelections);
        $('#radiusMiles').on('input change', saveSelections);
        $('#searchForm').on('submit', saveSelections);
    })();

    function setResultsLoading(isLoading){
        var $container = $('#resultsContainer');
        var $btn = $('#searchForm button[type="submit"]');
        if(isLoading){
            $btn.prop('disabled', true);
            $container.html(
                "<div class='text-center py-5'>" +
                    "<div><i class='bi bi-arrow-repeat bi-spin fs-1'></i></div>" +
                    "<div class='mt-2 text-muted'>Loading…</div>" +
                "</div>"
            );
        }else{
            $btn.prop('disabled', false);
        }
    }

    $('#searchForm').on('submit', function(e){
        // Non-JS fallback remains: only prevent default when AJAX is available.
        e.preventDefault();

        setResultsLoading(true);

        $.ajax({
            url: buildActionUrl('search'),
            type: 'POST',
            data: $(this).serialize(),
            success: function(html){
                $('#resultsContainer').html(html);
            },
            error: function(xhr, status, err){
                var msg = 'Error loading results.';
                try{
                    var detail = (xhr && (xhr.responseText || xhr.statusText)) ? (xhr.responseText || xhr.statusText) : (err || status);
                    msg = msg + ' ' + detail;
                }catch(_e){ }
                $('#resultsContainer').html("<div class='alert alert-danger' role='alert'>" + msg + "</div>");
            },
            complete: function(){
                setResultsLoading(false);
            }
        });
    });

    function setRadiusSearchVisible(isVisible){
        var $col = $('#radiusSearchCol');
        if(isVisible){
            $col.show("fast")
        }else{
            $col.hide("fast")
        }
    }

    function syncRadiusVisibilityFromCenterZip(){
        var v = ($('#centerZip').val() || '').toString();
        // "In use" = any entered value; we show as soon as the user starts typing.
        setRadiusSearchVisible(v.trim().length > 0);
    }

    function syncRadiusLabel(){
        var v = $('#radiusMiles').val();
        $('#radiusMilesValue').text(v);
    }
    $('#radiusMiles').on('input change', syncRadiusLabel);
    syncRadiusLabel();

    $('#centerZip').on('input change blur', syncRadiusVisibilityFromCenterZip);
    syncRadiusVisibilityFromCenterZip();
});
