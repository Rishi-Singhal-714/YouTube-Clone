// Main page functionality
document.addEventListener('DOMContentLoaded', async () => {
    // Load popular videos on homepage
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
        await loadPopularVideos();
    }
    
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    if (searchBtn) {
        searchBtn.addEventListener('click', performSearch);
    }
    
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
    }
});

async function loadPopularVideos() {
    try {
        const response = await fetch('/api/popular');
        const videos = await response.json();
        
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            videoGrid.innerHTML = videos.map(video => `
                <div class="video-card" onclick="window.location.href='watch.html?v=${video.id}'">
                    <div class="video-thumbnail">
                        <img src="${video.thumbnail}" alt="${video.title}">
                        <span class="video-duration">${formatDuration(video.duration)}</span>
                    </div>
                    <div class="video-info">
                        <h3>${video.title}</h3>
                        <p>${video.channelTitle}</p>
                        <p>${parseInt(video.viewCount).toLocaleString()} views • ${timeAgo(new Date(video.publishedAt))}</p>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading popular videos:', error);
    }
}

async function performSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput || !searchInput.value.trim()) return;
    
    const query = searchInput.value.trim();
    
    // Save search to history if user is logged in
    const token = localStorage.getItem('token');
    if (token) {
        try {
            await fetch('/api/history', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    video_id: '',
                    video_title: 'Search',
                    thumbnail_url: '',
                    search_query: query,
                    action_type: 'search'
                })
            });
        } catch (error) {
            console.error('Error saving search history:', error);
        }
    }
    
    // Redirect to search results
    window.location.href = `search.html?q=${encodeURIComponent(query)}`;
}

// Utility functions
function formatDuration(duration) {
    // Parse ISO 8601 duration format
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return '';
    
    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');
    
    let result = '';
    if (hours) result += hours.padStart(2, '0') + ':';
    result += (minutes || '0').padStart(2, '0') + ':';
    result += (seconds || '0').padStart(2, '0');
    
    return result;
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return interval + ' year' + (interval > 1 ? 's' : '') + ' ago';
    
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return interval + ' month' + (interval > 1 ? 's' : '') + ' ago';
    
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return interval + ' day' + (interval > 1 ? 's' : '') + ' ago';
    
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return interval + ' hour' + (interval > 1 ? 's' : '') + ' ago';
    
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return interval + ' minute' + (interval > 1 ? 's' : '') + ' ago';
    
    return 'just now';
}
