// Authentication state management
class Auth {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
        this.apiBase = '/api';
    }

    isAuthenticated() {
        return !!this.token;
    }

    getUser() {
        return this.user;
    }

    async logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.token = null;
        this.user = null;
        window.location.href = '/';
    }

    async checkAuth() {
        if (!this.token) return false;
        
        try {
            const response = await fetch(`${this.apiBase}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (!response.ok) {
                this.logout();
                return false;
            }
            
            const data = await response.json();
            if (data.success) {
                this.user = data.user;
                localStorage.setItem('user', JSON.stringify(data.user));
                return true;
            }
        } catch (error) {
            console.error('Auth check failed:', error);
        }
        
        return false;
    }

    updateAuthUI() {
        const authButtons = document.getElementById('authButtons');
        const userMenu = document.getElementById('userMenu');
        const usernameDisplay = document.getElementById('usernameDisplay');
        
        if (this.isAuthenticated() && userMenu) {
            if (authButtons) authButtons.style.display = 'none';
            userMenu.style.display = 'flex';
            userMenu.style.alignItems = 'center';
            userMenu.style.gap = '1rem';
            
            if (usernameDisplay && this.user) {
                usernameDisplay.textContent = `Hi, ${this.user.username}`;
            }
            
            // Add logout button if not already there
            if (!document.getElementById('logoutBtn')) {
                const logoutBtn = document.createElement('button');
                logoutBtn.id = 'logoutBtn';
                logoutBtn.className = 'btn btn-danger';
                logoutBtn.textContent = 'Logout';
                logoutBtn.onclick = () => this.logout();
                userMenu.appendChild(logoutBtn);
            }
        } else if (authButtons && userMenu) {
            authButtons.style.display = 'flex';
            userMenu.style.display = 'none';
        }
    }
}

// Initialize auth
const auth = new Auth();

// Update UI on page load
document.addEventListener('DOMContentLoaded', async () => {
    await auth.checkAuth();
    auth.updateAuthUI();
    
    // Add event listener for logout if button exists
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            auth.logout();
        });
    }
});
