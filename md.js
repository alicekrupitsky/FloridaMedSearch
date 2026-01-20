function buildActionUrl(action) {
    // Keeps existing query params but forces action=...
    try {
        var u = new URL(window.location.href);
        u.searchParams.set('action', action);
        u.hash = '';
        return u.toString();
    } catch (e) {
        // Fallback: keep existing params except action
        var qs = (window.location.search || '').replace(/^\?/, '');
        var kept = [];
        if (qs) {
            qs.split('&').forEach(function (p) {
                if (!p) return;
                var k = (p.split('=')[0] || '').toLowerCase();
                if (k !== 'action' && k !== 'md') kept.push(p);
            });
        }
        kept.unshift('action=' + encodeURIComponent(action));
        return window.location.pathname + '?' + kept.join('&');
    }
}

$(document).ready(function () {
    var licenseTable = null;
    var licenseRowsCache = [];
    var initialLicenseSearchApplied = false;

    function isStarOnlyEnabled() {
        return !!($('#licStarOnly').is(':checked'));
    }

    function renderStarButton(isStarred, licenseNumber) {
        var starred = !!(isStarred && parseInt(isStarred, 10) === 1);
        var icon = starred ? 'bi-star-fill' : 'bi-star';
        var cls = starred ? 'text-warning' : 'text-muted';
        var aria = starred ? 'Unstar doctor' : 'Star doctor';
        return "<button type='button' class='doc-star-btn' data-license='" + $('<div/>').text(licenseNumber || '').html() + "' aria-label='" + aria + "' aria-pressed='" + (starred ? 'true' : 'false') + "'>" +
            "<i class='bi " + icon + " " + cls + "' aria-hidden='true'></i>" +
            "</button>";
    }

    function getQueryParam(name) {
        try {
            var u = new URL(window.location.href);
            return (u.searchParams.get(name) || '').toString();
        } catch (_e) {
            return '';
        }
    }

    function getInitialLicenseNumber() {
        // Prefer explicit query string (?md=...), else fall back to hidden field value.
        var q = (getQueryParam('md') || '').trim();
        if (q) return q;
        return ($('#md').val() || '').toString().trim();
    }

    function scrollToResults() {
        var el = document.getElementById('resultsContainer');
        if (!el) return;
        try {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (_e) {
            // Older browsers: just jump
            window.location.hash = 'resultsContainer';
        }
    }

    function escapeRegex(s) {
        return (s || '').toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function distinctSorted(list) {
        var seen = {};
        var out = [];
        (list || []).forEach(function (x) {
            var v = (x || '').toString().trim();
            if (!v) return;
            var key = v.toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            out.push(v);
        });
        out.sort(function (a, b) { return a.localeCompare(b); });
        return out;
    }

    function setSelectOptions($select, values, emptyLabel, keepValue) {
        var current = keepValue ? ($select.val() || '') : '';
        var html = "<option value=''>" + (emptyLabel || "-- all --") + "</option>";
        values.forEach(function (v) {
            html += "<option value='" + $('<div/>').text(v).html() + "'>" + $('<div/>').text(v).html() + "</option>";
        });
        $select.html(html);
        if (keepValue && current) {
            $select.val(current);
            if ($select.val() !== current) $select.val('');
        }
    }

    function rebuildLicenseFilters(keepSelection) {
        var $county = $('#licCounty');
        var $city = $('#licCity');

        var counties = distinctSorted(licenseRowsCache.map(function (r) { return r.County; }));
        setSelectOptions($county, counties, '-- all counties --', !!keepSelection);

        var selectedCounty = ($county.val() || '').toString();
        var cityList = licenseRowsCache
            .filter(function (r) { return !selectedCounty || (r.County || '').toString() === selectedCounty; })
            .map(function (r) { return r.City; });
        var cities = distinctSorted(cityList);
        setSelectOptions($city, cities, '-- all cities --', !!keepSelection);
    }

    function applyLicenseColumnFilters() {
        if (!licenseTable) return;
        var county = ($('#licCounty').val() || '').toString();
        var city = ($('#licCity').val() || '').toString();

        if (county) {
            // Columns: 0 Star, 1 FullName, 2 License, 3 County, 4 City
            licenseTable.column(3).search('^' + escapeRegex(county) + '$', true, false);
        } else {
            licenseTable.column(3).search('');
        }

        if (city) {
            licenseTable.column(4).search('^' + escapeRegex(city) + '$', true, false);
        } else {
            licenseTable.column(4).search('');
        }

        licenseTable.draw();
    }

    function setResultsLoading(isLoading) {
        var $container = $('#resultsContainer');
        var $btn = $('#searchForm button[type="submit"]');
        if (isLoading) {
            $btn.prop('disabled', true);
            $container.html(
                "<div class='text-center py-5'>" +
                "<div><i class='bi bi-arrow-repeat bi-spin fs-1'></i></div>" +
                "<div class='mt-2 text-muted'>Loading…</div>" +
                "</div>"
            );
        } else {
            $btn.prop('disabled', false);
        }
    }

    $('#searchForm').on('submit', function (e) {
        // Non-JS fallback remains: only prevent default when AJAX is available.
        e.preventDefault();

        setResultsLoading(true);
        scrollToResults();

        $.ajax({
            url: buildActionUrl('search'),
            type: 'POST',
            data: $(this).serialize(),
            success: function (html) {
                $('#resultsContainer').html(html);
            },
            error: function (xhr, status, err) {
                var msg = 'Error loading results.';
                try {
                    if (xhr.responseText) msg = xhr.responseText;
                } catch (_e) { }
                $('#resultsContainer').html("<div class='alert alert-danger' role='alert'>" + msg + "</div>");
            },
            complete: function () {
                setResultsLoading(false);
            }
        });
    });

    // Inline License Lookup table (no modal)
    function initLicenseLookupTable() {
        if (!$.fn.dataTable || !$('#licenseTable').length) return;
        if (licenseTable) return;

        // Custom filter: when enabled, only show starred rows.
        // Scope it to the #licenseTable instance so it doesn't affect other tables.
        $.fn.dataTable.ext.search.push(function (settings, _data, dataIndex) {
            try {
                if (!settings || !settings.nTable || settings.nTable.id !== 'licenseTable') return true;
                if (!isStarOnlyEnabled()) return true;
                if (!licenseTable) return true;

                var rowData = licenseTable.row(dataIndex).data();
                return !!(rowData && parseInt(rowData.IsStarred, 10) === 1);
            } catch (_e) {
                return true;
            }
        });

        licenseTable = $('#licenseTable').DataTable({
            ajax: {
                url: buildActionUrl('data'),
                dataSrc: function (json) {
                    if (json && json.error) {
                        var msg = (json.message || 'Error loading license lookup data.').toString();
                        $('#licenseTable tbody').html("<tr><td colspan='5'><div class='alert alert-danger mb-0' role='alert'>" + $('<div/>').text(msg).html() + "</div></td></tr>");
                        licenseRowsCache = [];
                        rebuildLicenseFilters(false);
                        return [];
                    }

                    var rows = (json && json.rows) ? json.rows : [];
                    licenseRowsCache = rows;
                    rebuildLicenseFilters(true);
                    return rows;
                },
                error: function (xhr) {
                    var msg = 'Error loading license lookup data.';
                    try {
                        if (xhr && xhr.responseText) msg = xhr.responseText;
                    } catch (_e) { }
                    // If IIS returns an HTML error page, avoid dumping it into the UI.
                    if (msg && /<!DOCTYPE|<html/i.test(msg)) msg = 'Server error loading license lookup data.';
                    $('#licenseTable tbody').html("<tr><td colspan='5'><div class='alert alert-danger mb-0' role='alert'>" + $('<div/>').text(msg).html() + "</div></td></tr>");
                }
            },
            columns: [
                {
                    data: null,
                    orderable: false,
                    searchable: false,
                    width: '1%',
                    render: function (_d, _t, row) {
                        return renderStarButton(row && row.IsStarred, row && row.LicenseNumber);
                    }
                },
                { data: 'FullName' },
                { data: 'LicenseNumber' },
                { data: 'County' },
                { data: 'City' }
            ],
            responsive: true,
            deferRender: true,
            pageLength: 10,
            order: [[3, 'asc'], [4, 'asc'], [1, 'asc']]
        });

        // Star-only checkbox redraw.
        $('#licStarOnly').on('change', function () {
            if (!licenseTable) return;
            licenseTable.draw();
        });

        // If the page is opened with ?md=LICENSE, prefill the DataTables filter box.
        // This matches the built-in "Search" UI (global DataTables filter).
        (function applyInitialLicenseSearchOnce() {
            if (initialLicenseSearchApplied) return;
            var md = getInitialLicenseNumber();
            if (!md) return;
            initialLicenseSearchApplied = true;

            // Reset dropdown filters so they don't hide the license.
            $('#licCounty').val('');
            $('#licCity').val('');
            try {
                licenseTable.column(3).search('');
                licenseTable.column(4).search('');
            } catch (_e) { }

            licenseTable.search(md).draw();

            // Highlight the matching row if it exists.
            licenseTable.one('draw', function () {
                try {
                    $('#licenseTable tbody tr').removeClass('row-selected');
                    licenseTable.rows({ page: 'current' }).every(function () {
                        var d = this.data();
                        if (d && (d.LicenseNumber || '').toString() === md) {
                            $(this.node()).addClass('row-selected');
                        }
                    });
                } catch (_e) { }
            });
        })();

        // Star toggle (do not trigger row click)
        $('#licenseTable tbody').on('click', '.doc-star-btn', function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (!licenseTable) return;

            var $btn = $(this);
            var lic = ($btn.attr('data-license') || '').toString().trim();
            if (!lic) return;

            $btn.prop('disabled', true);

            $.ajax({
                url: buildActionUrl('toggleStar'),
                type: 'POST',
                dataType: 'json',
                data: { license: lic },
                success: function (json) {
                    if (!json || json.error) {
                        console.error('toggleStar error', json);
                        return;
                    }

                    // Update the row data so future renders are correct.
                    var $tr = $btn.closest('tr');
                    try {
                        var row = licenseTable.row($tr);
                        var d = row.data();
                        if (d) {
                            d.IsStarred = json.isStarred ? 1 : 0;
                            row.data(d);
                        }
                    } catch (_e) { }

                    // Update the button immediately.
                    $btn.replaceWith(renderStarButton(json.isStarred ? 1 : 0, lic));

                    // If filtering by starred, immediately re-apply the filter.
                    try {
                        licenseTable.draw(false);
                    } catch (_e) { }
                },
                error: function (xhr) {
                    console.error('toggleStar ajax error', xhr && xhr.status, xhr && xhr.responseText);
                },
                complete: function () {
                    $btn.prop('disabled', false);
                }
            });
        });

        $('#licenseTable tbody').on('click', 'tr', function () {
            if (!licenseTable) return;

            var data = null;
            try {
                data = licenseTable.row(this).data();
            } catch (_e) { }
            if (!data) return;

            var lic = (data.LicenseNumber || '').toString();
            if (!lic) return;

            // Visual selection
            $('#licenseTable tbody tr').removeClass('row-selected');
            $(this).addClass('row-selected');

            // Set hidden field and load results
            $('#md').val(lic).trigger('input').trigger('change');
            $('#searchForm').trigger('submit');
        });

        $('#licCounty').on('change', function () {
            rebuildLicenseFilters(true);
            applyLicenseColumnFilters();
        });
        $('#licCity').on('change', applyLicenseColumnFilters);

    }

    initLicenseLookupTable();
});
