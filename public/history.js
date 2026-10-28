//Dynamic History Controller
document.addEventListener('DOMContentLoaded', () => {
    const historyTableView = document.getElementById('historyTableView');
    const historyEmptyView = document.getElementById('historyEmptyView');
    const historyTableBody = document.getElementById('historyTableBody');

    // Retrieve history from database/localStorage (default to empty array for dynamic binding)
    async function loadScanHistory() {
        // the redesigned History page draws its own records (app.js), so there is nothing for this script to do there
        if (!historyTableBody || !historyTableView || !historyEmptyView) return;
        let scans = [];

        try {
            // Check for backend Express endpoint first
            const response = await fetch('/api/history');
            if (response.ok) {
                scans = await response.json();
            } else {
                // Fallback to local storage
                scans = JSON.parse(localStorage.getItem('kibbleguard_scan_history')) || [];
            }
        } catch (err) {
            scans = JSON.parse(localStorage.getItem('kibbleguard_scan_history')) || [];
        }

        renderHistory(scans);
    }

    function renderHistory(scans) {
        if (!scans || scans.length === 0) {
            historyTableView.classList.add('hidden');
            historyEmptyView.classList.remove('hidden');
            return;
        }

        historyEmptyView.classList.add('hidden');
        historyTableView.classList.remove('hidden');
        historyTableBody.innerHTML = '';

        scans.forEach(scan => {
            const isCanine = (scan.species || '').toLowerCase() === 'canine';
            const speciesIcon = isCanine ? 'fa-dog' : 'fa-cat';
            const itemBadgeIcon = isCanine ? 'fa-bone' : 'fa-fish';
            const iconBg = isCanine ? 'bg-orange-50 text-[#ba7f57]' : 'bg-teal-50 text-[#45671d]';
            const speciesColor = isCanine ? 'text-[#ba7f57]' : 'text-[#45671d]';

            let resultColorClass = 'text-emerald-600 bg-emerald-50 border-emerald-200';
            if (scan.result === 'Caution') {
                resultColorClass = 'text-[#ba7f57] bg-[#ba7f57]/10 border-[#ba7f57]/30';
            } else if (scan.result === 'Toxic') {
                resultColorClass = 'text-rose-600 bg-rose-50 border-rose-200';
            }

            const row = document.createElement('tr');
            row.className = 'border-b border-[#ece6e1]/60 hover:bg-white/60 transition-colors cursor-pointer';
            row.onclick = () => window.location.href = `results.html?scanId=${scan.id || ''}`;

            row.innerHTML = `
                <td class="py-6 px-8 font-extrabold text-slate-800 flex items-center gap-3">
                    <span class="w-9 h-9 rounded-2xl ${iconBg} flex items-center justify-center text-sm shadow-xs">
                        <i class="fa-solid ${itemBadgeIcon}"></i>
                    </span>
                    <div>
                        <p class="font-bold text-slate-900">${scan.productName || 'Unnamed Product'}</p>
                        <p class="text-[10px] text-[#91967e] font-semibold">${scan.batchNumber || 'Batch N/A'}</p>
                    </div>
                </td>
                <td class="py-6 px-4 ${speciesColor} font-black uppercase text-xs">
                    <i class="fa-solid ${speciesIcon} mr-1"></i> ${scan.species}
                </td>
                <td class="py-6 px-4 text-xs font-bold text-slate-400">${scan.date || new Date().toLocaleDateString()}</td>
                <td class="py-6 px-8 text-right">
                    <span class="inline-block text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${resultColorClass}">
                        ${scan.result}
                    </span>
                </td>
            `;

            historyTableBody.appendChild(row);
        });
    }

    loadScanHistory();
});