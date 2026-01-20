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
    var modal = new bootstrap.Modal(document.getElementById('cptModal'));
    var MED_IS_AUTH = !!(document.body && document.body.getAttribute('data-is-auth') === '1');

    function formatUseCount(value){
        var n = parseInt(value, 10);
        if(isNaN(n)) n = 0;
        try{ return n.toLocaleString('en-US'); }catch(e){ return String(n); }
    }

    function renderCptStarButton(isStarred, cptCode){
        var starred = !!isStarred;
        var icon = starred ? 'bi-star-fill' : 'bi-star';
        var cls = starred ? 'text-warning' : 'text-muted';
        var aria = starred ? 'Unstar CPT' : 'Star CPT';
        var safeCpt = $('<div/>').text(cptCode || '').html();
        return "<button type='button' class='cpt-star-btn' data-cpt='" + safeCpt + "' aria-label='" + aria + "' aria-pressed='" + (starred ? 'true' : 'false') + "'>" +
            "<i class='bi " + icon + " " + cls + "' aria-hidden='true'></i>" +
            "</button>";
    }

    function getSingleCptFromInput(){
        var raw = ($('input[name="cpt"]').val() || '').toString().trim();
        if(!raw) return '';
        var parts = raw.split(/[\s,;]+/).filter(function(x){ return x && x.trim().length > 0; });
        if(parts.length !== 1) return '';
        return parts[0].trim();
    }

    function applySingleCptToTableSearch(table){
        if(!table) return;
        var code = getSingleCptFromInput();
        if(!code) return;

        // Only auto-fill when the search box is empty to avoid clobbering user input.
        var $filterInput = $('div.dataTables_filter input', table.table().container());
        var currentSearch = ($filterInput.val() || '').toString().trim();
        if(currentSearch.length > 0) return;

        table.search(code).draw();
        $filterInput.val(code).trigger('focus');
    }

    $('#openSearch').on('click', function(){
        modal.show();
        if(!$.fn.dataTable.isDataTable('#cptTable')){
            // Show the star-only toggle only when stars are meaningful.
            try{ $('#cptStarOnlyWrap').toggle(!!MED_IS_AUTH); }catch(_e){}

            var table = $('#cptTable').DataTable({
                ajax: {
                    url: buildActionUrl('data'),
                    dataSrc: function(json){
                        if(!json) return [];
                        if(json.error){
                            console.error('CPT data error', json);
                            alert('CPT data error: ' + (json.message || 'unknown'));
                            return [];
                        }
                        if(Array.isArray(json)) return json;
                        for(var k in json){ if(Array.isArray(json[k])) return json[k]; }
                        return [];
                    },
                    error: function(xhr, status, err){
                        if(status === 'abort' || (xhr && xhr.statusText && xhr.statusText.toLowerCase() === 'abort')){
                            console.warn('CPT data AJAX aborted');
                            return;
                        }
                        try{
                            console.error('AJAX error', status, err, xhr && xhr.responseText);
                            alert('AJAX error loading CPT data: ' + (xhr && xhr.status ? xhr.status + ': ' : '') + (xhr && (xhr.statusText || xhr.responseText) ? (xhr.statusText || xhr.responseText) : status));
                        }catch(e){
                            alert('AJAX error loading CPT data');
                        }
                    }
                },
                columns: [
                    { data: null, orderable:false, searchable:false, width:'4%', render: function(){ return '<input type="checkbox" class="cpt-select" />'; } },
                    { data: 'isStarred', visible: MED_IS_AUTH, orderable:false, searchable:false, width:'4%', render: function(d, _t, row){ return renderCptStarButton(d, row && row.cptCode); } },
                    { data: 'cptCode', width: '8%', render: function(d){ return '<strong>'+d+'</strong>'; } },
                    { data: 'combinedDesc', width: '60%', render: function(d){ return '<div style="white-space:normal;word-break:break-word;">'+(d || '')+'</div>'; } },
                    { data: 'use_count', width: '10%', className: 'dt-body-right', render: function(d){ return formatUseCount(d); } }
                ],
                responsive: false,
                deferRender: true,
                // Remove DataTables Buttons (Copy/CSV) from the CPT modal.
                dom: "<'row'<'col-sm-6'><'col-sm-6'f>>rt<'row'<'col-sm-6'i><'col-sm-6'p>>",
                pageLength: 30,
                order: [[2,'asc']],
                createdRow: function(row,data){
                    $(row).attr('data-cpt', data.cptCode);
                }
            });

            var populateFilters = function(json){
                var data = Array.isArray(json) ? json : (json && Array.isArray(json.data) ? json.data : []);
                var sections = {};
                $('#cptSection').empty().append('<option value="">-- all sections --</option>');
                $('#cptSubsection').empty().append('<option value="">-- all subsections --</option>');
                for(var i=0;i<data.length;i++){
                    var r = data[i] || {};
                    var sec = (r.section || '').toString();
                    var sub = (r.subsection || '').toString();
                    if(sec){ if(!sections[sec]) sections[sec] = {}; }
                    if(sec && sub){ sections[sec][sub] = true; }
                }
                Object.keys(sections).sort().forEach(function(s){ $('#cptSection').append($('<option>').val(s).text(s)); });
                $('#cptSection').data('map', sections);
            };

            table.on('xhr', function(){ var json = table.ajax.json(); populateFilters(json); table.draw(); });

            $.fn.dataTable.ext.search = $.fn.dataTable.ext.search.filter(function(fn){
                return !(fn && fn._cptTableFilter);
            });

            var cptTableFilter = function(settings, data, dataIndex){
                if(settings.nTable.id !== 'cptTable') return true;
                var selSec = $('#cptSection').val();
                var selSub = $('#cptSubsection').val();
                var starOnly = MED_IS_AUTH && ($('#cptStarOnly').is(':checked'));
                var row = table.row(dataIndex).data();
                if(!row) return true;
                if(selSec && (row.section || '') !== selSec) return false;
                if(selSub && (row.subsection || '') !== selSub) return false;
                if(starOnly && !row.isStarred) return false;
                return true;
            };
            cptTableFilter._cptTableFilter = true;
            $.fn.dataTable.ext.search.push(cptTableFilter);

            $('#cptSection').on('change', function(){
                var map = $(this).data('map') || {};
                var sec = $(this).val();
                $('#cptSubsection').empty().append('<option value="">-- all subsections --</option>');
                if(sec && map[sec]){
                    Object.keys(map[sec]).sort().forEach(function(sub){ $('#cptSubsection').append($('<option>').val(sub).text(sub)); });
                }
                table.draw();
            });

            $('#cptSubsection').on('change', function(){ table.draw(); });

            $('#cptStarOnly').on('change', function(){ table.draw(); });

            // Toggle CPT stars (authenticated users only)
            $(document).on('click', '.cpt-star-btn', function(e){
                e.preventDefault();
                e.stopPropagation();
                if(!MED_IS_AUTH) return;

                var $btn = $(this);
                var cpt = ($btn.attr('data-cpt') || '').toString().trim();
                if(!cpt) return;

                $btn.prop('disabled', true);
                $.ajax({
                    url: buildActionUrl('toggleCptStar'),
                    type: 'POST',
                    dataType: 'json',
                    data: { cptCode: cpt },
                    success: function(json){
                        if(!json || json.error){
                            console.error('toggleCptStar error', json);
                            return;
                        }

                        var starred = !!json.isStarred;

                        // Update icon + aria
                        var $icon = $btn.find('i.bi');
                        if($icon.length){
                            $icon.removeClass('bi-star bi-star-fill text-muted text-warning');
                            $icon.addClass(starred ? 'bi-star-fill text-warning' : 'bi-star text-muted');
                        }
                        $btn.attr('aria-pressed', starred ? 'true' : 'false');
                        $btn.attr('aria-label', starred ? 'Unstar CPT' : 'Star CPT');

                        // Update row model so starred-only filter works immediately.
                        try{
                            var tr = $btn.closest('tr');
                            var rowApi = table.row(tr);
                            var rowData = rowApi.data();
                            if(rowData){
                                rowData.isStarred = starred;
                                rowApi.data(rowData);
                            }
                        }catch(_e){}

                        if($('#cptStarOnly').is(':checked')){
                            table.draw(false);
                        }
                    },
                    error: function(xhr){
                        console.error('toggleCptStar ajax error', xhr && xhr.status, xhr && xhr.responseText);
                    },
                    complete: function(){
                        $btn.prop('disabled', false);
                    }
                });
            });

            document.getElementById('cptModal').addEventListener('shown.bs.modal', function(){
                $('#cptSection').val(''); $('#cptSubsection').val('');
                applySingleCptToTableSearch(table);
            });

            $('#cptTable tbody').on('change', '.cpt-select', function(e){
                var tr = $(this).closest('tr');
                if(this.checked){ tr.addClass('table-active'); }
                else { tr.removeClass('table-active'); }
            });

            $(document).on('click', '#applyCptSelected', function(){
                var vals = [];
                $('#cptTable tbody .cpt-select:checked').each(function(){
                    var code = $(this).closest('tr').attr('data-cpt');
                    if(code) vals.push(code);
                });
                $('input[name="cpt"]').val(vals.join(',')).trigger('change');
                modal.hide();
            });
        }else{
            try{ $('#cptStarOnlyWrap').toggle(!!MED_IS_AUTH); }catch(_e){}
            $('#cptTable').DataTable().ajax.url(buildActionUrl('data')).load();
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

    // Persist County + Center ZIP selections.
    (function(){
        var KEY_COUNTY = 'MED.location.counties';
        var KEY_CENTER_ZIP = 'MED.location.centerZip';
        var KEY_RADIUS_MILES = 'MED.location.radiusMiles';
        var KEY_CPT = 'MED.outpatient.cpt';

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

                var cpt = ($('input[name="cpt"]').val() || '').toString().trim();
                if(cpt){ localStorage.setItem(KEY_CPT, cpt); }
                else { localStorage.removeItem(KEY_CPT); }
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

                var $cpt = $('input[name="cpt"]');
                if($cpt.length && (($cpt.val() || '').toString().trim().length === 0)){
                    var savedCpt = localStorage.getItem(KEY_CPT);
                    if(savedCpt){ $cpt.val(savedCpt); }
                }
            }catch(e){
                // ignore
            }
        }

        loadSelections();

        $('#county').on('change', saveSelections);
        $('#centerZip').on('input change blur', saveSelections);
        $('#radiusMiles').on('input change', saveSelections);
        $('input[name="cpt"]').on('input change blur', saveSelections);
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
