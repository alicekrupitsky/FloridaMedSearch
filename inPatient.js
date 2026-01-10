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

    function formatUseCount(value){
        var n = parseInt(value, 10);
        if(isNaN(n)) n = 0;
        try{ return n.toLocaleString('en-US'); }catch(e){ return String(n); }
    }

    $('#openSearch').on('click', function(){
        modal.show();
        if(!$.fn.dataTable.isDataTable('#icdTable')){
            var table = $('#icdTable').DataTable({
                ajax: {
                    url: buildActionUrl('data'),
                    dataSrc: function(json){
                        if(!json) return [];
                        if(json.error){
                            console.error('Procedure data error', json);
                            alert('Procedure data error: ' + (json.message || 'unknown'));
                            return [];
                        }
                        if(Array.isArray(json)) return json;
                        for(var k in json){ if(Array.isArray(json[k])) return json[k]; }
                        return [];
                    },
                    error: function(xhr, status, err){
                        if(status === 'abort' || (xhr && xhr.statusText && xhr.statusText.toLowerCase() === 'abort')){
                            console.warn('Procedure data AJAX aborted');
                            return;
                        }
                        try{
                            console.error('AJAX error', status, err, xhr && xhr.responseText);
                            alert('AJAX error loading procedure data: ' + (xhr && xhr.status ? xhr.status + ': ' : '') + (xhr && (xhr.statusText || xhr.responseText) ? (xhr.statusText || xhr.responseText) : status));
                        }catch(e){
                            alert('AJAX error loading procedure data');
                        }
                    }
                },
                columns: [
                    { data: null, orderable:false, searchable:false, width:'4%', render: function(){ return '<input type="checkbox" class="icd-select" />'; } },
                    { data: 'procCode', width: '12%', render: function(d){ return '<strong>'+(d || '')+'</strong>'; } },
                    { data: 'description', width: '60%', render: function(d){ return '<div style="white-space:normal;word-break:break-word;">'+(d || '')+'</div>'; } },
                    { data: 'use_count', width: '10%', render: function(d){ return formatUseCount(d); } }
                ],
                responsive: false,
                deferRender: true,
                dom: "<'row'<'col-sm-6'B><'col-sm-6'f>>rt<'row'<'col-sm-6'i><'col-sm-6'p>>",
                pageLength: 30,
                order: [[1,'asc']],
                createdRow: function(row,data){
                    $(row).attr('data-icd', data.procCode);
                }
            });

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
                var row = table.row(dataIndex).data();
                if(!row) return true;
                if(selSec && (row.category || '') !== selSec) return false;
                if(selSub && (row.subcategory || '') !== selSub) return false;
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

            document.getElementById('icdModal').addEventListener('shown.bs.modal', function(){
                $('#icdSection').val(''); $('#icdSubsection').val('');
            });

            $('#icdTable tbody').on('change', '.icd-select', function(e){
                var tr = $(this).closest('tr');
                if(this.checked){ tr.addClass('table-active'); }
                else { tr.removeClass('table-active'); }
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
        }else{
            $('#icdTable').DataTable().ajax.url(buildActionUrl('data')).load();
        }
    });
});

$(document).ready(function() {
    $('#county').select2({
        placeholder: 'Select counties',
        allowClear: true
    });

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
