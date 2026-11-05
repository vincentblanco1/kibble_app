//Dedicated authentication controller
// KibbleGuard Authentication & Signup Safeguards Controller
document.addEventListener('DOMContentLoaded', () => {
    let currentMode = 'login';

    // UI Elements
    const tabLogin = document.getElementById('tabLogin');
    const tabSignup = document.getElementById('tabSignup');
    const signupFields = document.getElementById('signupFields');
    const confirmPassGroup = document.getElementById('confirmPassGroup');
    const passwordRulesCard = document.getElementById('passwordRulesCard');
    const authTitle = document.getElementById('authTitle');
    const authSub = document.getElementById('authSub');
    const ctaText = document.getElementById('ctaText');
    const ctaBtn = document.getElementById('ctaBtn');
    const authForm = document.getElementById('authForm');

    // Inputs
    const ownerNameInput = document.getElementById('ownerNameInput');
    const petNameInput = document.getElementById('petNameInput');
    const speciesInput = document.getElementById('speciesInput');
    const emailInput = document.getElementById('emailInput');
    const emailValidationMsg = document.getElementById('emailValidationMsg');
    const verificationCodeGroup = document.getElementById('verificationCodeGroup');
    const verificationCodeInput = document.getElementById('verificationCodeInput');
    let verificationCodeSent = false;
    const passInput = document.getElementById('passInput');
    const confirmPassInput = document.getElementById('confirmPassInput');
    const confirmPassMsg = document.getElementById('confirmPassMsg');

    // Visibility Toggle Buttons
    const togglePassBtn = document.getElementById('togglePassBtn');
    const toggleConfirmPassBtn = document.getElementById('toggleConfirmPassBtn');


    // Password Rule Elements
    const ruleLen = document.getElementById('rule-len');
    const ruleCase = document.getElementById('rule-case');
    const ruleNum = document.getElementById('rule-num');
    const ruleSym = document.getElementById('rule-sym');

    // Toggle Eye Visibility Helper
    function setupPasswordToggle(button, input) {
        if (!button || !input) return;
        button.addEventListener('click', () => {
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            
            const icon = button.querySelector('i');
            if (icon) {
                if (isPassword) {
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                } else {
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            }
        });
    }

    setupPasswordToggle(togglePassBtn, passInput);
    setupPasswordToggle(toggleConfirmPassBtn, confirmPassInput);

    // Switch between Login and Sign Up
    function applyMode(mode) {
        currentMode = mode;
        verificationCodeSent = false;
        verificationCodeGroup.classList.add('hidden');
        verificationCodeInput.required = false;
        verificationCodeInput.value = '';
        if (mode === 'signup') {
            tabSignup.className = 'py-2 text-xs font-bold rounded-lg bg-white text-brand-teal shadow-sm transition-all';
            tabLogin.className = 'py-2 text-xs font-bold rounded-lg text-brand-muted hover:text-brand-ink transition-all';
            signupFields.classList.remove('hidden');
            confirmPassGroup.classList.remove('hidden');
            passwordRulesCard.classList.remove('hidden');
            authTitle.textContent = 'Join KibbleGuard';
            authSub.textContent = 'Set up your profile and evaluate ingredients.';
            ctaText.textContent = 'Create Account';
        } else {
            tabLogin.className = 'py-2 text-xs font-bold rounded-lg bg-white text-brand-teal shadow-sm transition-all';
            tabSignup.className = 'py-2 text-xs font-bold rounded-lg text-brand-muted hover:text-brand-ink transition-all';
            signupFields.classList.add('hidden');
            confirmPassGroup.classList.add('hidden');
            passwordRulesCard.classList.add('hidden');
            authTitle.textContent = 'Welcome back';
            authSub.textContent = 'Access your scans and the ingredient database.';
            ctaText.textContent = 'Log In';
        }
    }

    const urlParams = new URLSearchParams(window.location.search);
    applyMode(urlParams.get('mode') === 'signup' ? 'signup' : 'login');

    tabLogin.addEventListener('click', () => applyMode('login'));
    tabSignup.addEventListener('click', () => applyMode('signup'));

    // 1. Email Safeguard: RFC 5322 Standard + Block Disposable Providers
    function validateEmail(val) {
        const strictEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const throwaways = ['mailinator.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com', 'yopmail.com'];

        if (!strictEmailRegex.test(val)) {
            return { valid: false, msg: 'Invalid email syntax.' };
        }
        const domain = val.split('@')[1]?.toLowerCase();
        if (throwaways.includes(domain)) {
            return { valid: false, msg: 'Temporary/disposable domains disallowed.' };
        }
        return { valid: true, msg: 'Valid address.' };
    }

    emailInput.addEventListener('input', () => {
        if (verificationCodeSent) {
            verificationCodeSent = false;
            verificationCodeGroup.classList.add('hidden');
            verificationCodeInput.required = false;
            verificationCodeInput.value = '';
            ctaText.textContent = 'Create Account';
        }
        if (currentMode !== 'signup') return;
        const result = validateEmail(emailInput.value.trim());
        emailValidationMsg.classList.remove('hidden');
        emailValidationMsg.textContent = result.msg;

        if (result.valid) {
            emailValidationMsg.className = 'text-[11px] font-semibold text-emerald-600';
            emailInput.classList.remove('border-rose-400');
            emailInput.classList.add('border-emerald-400');
        } else {
            emailValidationMsg.className = 'text-[11px] font-semibold text-rose-500';
            emailInput.classList.remove('border-emerald-400');
            emailInput.classList.add('border-rose-400');
        }
    });

    // 2. Real-Time Password Rule Evaluation
    function updateRule(el, isValid) {
        if (isValid) {
            el.className = 'flex items-center gap-2 text-emerald-600 font-semibold';
            el.querySelector('i').className = 'fa-solid fa-circle-check text-emerald-600';
        } else {
            el.className = 'flex items-center gap-2 text-slate-400 font-medium';
            el.querySelector('i').className = 'fa-solid fa-circle-xmark text-slate-300';
        }
    }

    passInput.addEventListener('input', () => {
        if (currentMode !== 'signup') return;
        const pass = passInput.value;

        updateRule(ruleLen, pass.length >= 8);
        updateRule(ruleCase, /[a-z]/.test(pass) && /[A-Z]/.test(pass));
        updateRule(ruleNum, /\d/.test(pass));
        updateRule(ruleSym, /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass));
    });

    // 3. Confirm Password Live Check
    confirmPassInput.addEventListener('input', () => {
        if (currentMode !== 'signup') return;
        if (confirmPassInput.value && confirmPassInput.value !== passInput.value) {
            confirmPassMsg.classList.remove('hidden');
            confirmPassInput.classList.add('border-rose-400');
        } else {
            confirmPassMsg.classList.add('hidden');
            confirmPassInput.classList.remove('border-rose-400');
        }
    });

    // 4. Form Submission Pipeline
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passInput.value;

        // Login Action
        if (currentMode === 'login') {
            ctaBtn.disabled = true;
            ctaText.textContent = 'Verifying...';

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    const user = data.user || data;
                    localStorage.setItem('kibbleguard_auth_user', user.email || email);
                    localStorage.setItem('kibbleguard_user', JSON.stringify(user));

                    // Save profile data (including avatar) from server
                    if (data.profile) {
                        localStorage.setItem('kibbleguard_user_profile', JSON.stringify(data.profile));
                    }

                    // Check user role: redirect staff to admin panel, pet owners to app dashboard
                    const adminRoles = ['Chief Admin', 'Ingredient Reviewer', 'Support Admin'];
                    if (adminRoles.includes(user.role)) {
                        localStorage.setItem('kibbleguard-admin-email', user.email || email);
                        window.location.href = 'admin/dashboard.html';
                    } else {
                        window.location.href = 'index.html';
                    }
                    return;
                } else {
                    alert(data.error || 'Invalid email or password.');
                }
            } catch (err) {
                alert('Cannot connect to server. Is node server.js running?');
            } finally {
                ctaBtn.disabled = false;
                ctaText.textContent = 'Log In';
            }
            return;
        }

        // Signup Validation Checks
        const emailResult = validateEmail(email);
        if (!emailResult.valid) {
            alert(emailResult.msg);
            emailInput.focus();
            return;
        }

        const isPasswordCompliant = 
            password.length >= 8 &&
            /[a-z]/.test(password) &&
            /[A-Z]/.test(password) &&
            /\d/.test(password) &&
            /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

        if (!isPasswordCompliant) {
            alert('Please fulfill all password security requirements.');
            passInput.focus();
            return;
        }

        if (password !== confirmPassInput.value) {
            confirmPassMsg.classList.remove('hidden');
            confirmPassInput.focus();
            return;
        }

        const ownerName = ownerNameInput ? ownerNameInput.value.trim() : '';
        if (!ownerName) {
            alert("Please enter your name.");
            if (ownerNameInput) ownerNameInput.focus();
            return;
        }

        const petName = petNameInput.value.trim();
        if (!petName) {
            alert("Please provide your pet's name.");
            petNameInput.focus();
            return;
        }

        // First request a code. The next submission verifies it and creates the account.
        ctaBtn.disabled = true;
        const species = speciesInput.value;
        try {
            if (!verificationCodeSent) {
                ctaText.textContent = 'Sending Code...';
                const codeResponse = await fetch('/api/auth/send-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const codeData = await codeResponse.json();
                if (!codeResponse.ok) {
                    alert(codeData.error || 'Could not send the verification code.');
                    return;
                }
                verificationCodeSent = true;
                verificationCodeGroup.classList.remove('hidden');
                verificationCodeInput.required = true;
                verificationCodeInput.focus();
                ctaText.textContent = 'Verify & Create Account';
                alert('A 6-digit verification code has been sent to ' + email + '.');
                return;
            }

            const code = verificationCodeInput.value.trim();
            if (!/^[0-9]{6}$/.test(code)) {
                alert('Please enter the 6-digit code sent to your email.');
                verificationCodeInput.focus();
                return;
            }

            ctaText.textContent = 'Verifying...';
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: ownerName, email, password, code })
            });
            const data = await response.json();

            if (!response.ok) {
                alert(data.error || 'Registration failed.');
                return;
            }

            const currentPets = JSON.parse(localStorage.getItem('kibbleguard_pets') || '[]');
            const newRegisteredPet = {
                id: 'pet-' + Date.now(),
                user_id: data.id,
                name: petName,
                species: species,
                breed: species === 'Canine' ? 'Mixed Canine' : 'Domestic Shorthair',
                gender: 'Female',
                birthdate: new Date().toISOString().split('T')[0],
                weight: species === 'Canine' ? 10.0 : 4.0,
                allergies: 'None recorded yet',
                vaccine_status: 'Up to Date',
                deworming_date: new Date().toISOString().split('T')[0],
                image_url: species === 'Canine'
                    ? 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=120&h=120&fit=crop'
                    : 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120&h=120&fit=crop'
            };

            currentPets.unshift(newRegisteredPet);
            try {
                await fetch('/api/pets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newRegisteredPet)
                });
            } catch (petErr) {
                console.warn('Could not save starter pet profile:', petErr);
            }

            localStorage.setItem('kibbleguard_pets', JSON.stringify(currentPets));
            localStorage.setItem('kibbleguard_auth_user', email);
            localStorage.setItem('kibbleguard_user', JSON.stringify(data));
            window.location.href = 'index.html';
        } catch (err) {
            alert('Database connection error during registration.');
        } finally {
            ctaBtn.disabled = false;
            ctaText.textContent = verificationCodeSent ? 'Verify & Create Account' : 'Create Account';
        }
    });

});