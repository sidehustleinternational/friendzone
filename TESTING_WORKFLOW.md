# FriendZone Testing Workflow

## 🎯 Safe Testing Before Merging to Main

This workflow lets you test builds before they touch the main branch.

---

## 📋 **Recommended Workflow: Feature Branches**

### **Step 1: Create Feature Branch (On Mac)**

```bash
# Create a branch for your fix/feature
git checkout -b fix/friend-requests
# or: git checkout -b feature/zone-grouping

# Make your changes
# ... edit files ...

# Commit and push
git add -A
git commit -m "Fix: friend requests not disappearing"
git push origin fix/friend-requests
```

---

### **Step 2: Build from Feature Branch (In Codespaces)**

```bash
# Switch to your feature branch
git checkout fix/friend-requests
git pull origin fix/friend-requests

# Run build script (it auto-detects the branch)
./build.sh
```

**Output:**
```
🌳 Current branch: fix/friend-requests
🔄 Pulling latest changes from GitHub...
📦 Current build number: Build 147
🆙 Incrementing to Build 148...
💾 Committing build number...
🏗️  Starting EAS build for iOS...
  Build: 148 [fix/friend-requests]
```

---

### **Step 3: Test in TestFlight**

- Build appears in TestFlight (~15-20 minutes)
- Install and test thoroughly
- Check if the fix works
- Look for any new issues

---

### **Step 4: Merge or Fix**

#### **✅ If Tests Pass:**

```bash
# On Mac
git checkout main
git pull origin main
git merge fix/friend-requests
git push origin main

# Clean up
git branch -d fix/friend-requests
git push origin --delete fix/friend-requests
```

#### **❌ If Tests Fail:**

```bash
# On Mac - stay on feature branch
git checkout fix/friend-requests

# Make more fixes
# ... edit files ...

git add -A
git commit -m "Fix: additional issue found in testing"
git push origin fix/friend-requests

# In Codespaces - rebuild
git checkout fix/friend-requests
git pull origin fix/friend-requests
./build.sh

# Test again
```

---

## 🔄 **Complete Example**

```bash
# === ON MAC ===
# 1. Create feature branch
git checkout -b fix/notification-spam
git add src/services/firebase.ts
git commit -m "Fix: Prevent duplicate notifications with AsyncStorage"
git push origin fix/notification-spam

# === IN CODESPACES ===
# 2. Build test version
git checkout fix/notification-spam
./build.sh
# → Creates Build 148 [fix/notification-spam]

# === WAIT FOR TESTFLIGHT ===
# 3. Test Build 148
# ✅ Works great!

# === ON MAC ===
# 4. Merge to main
git checkout main
git pull origin main
git merge fix/notification-spam
git push origin main

# 5. Clean up
git branch -d fix/notification-spam
git push origin --delete fix/notification-spam

# === IN CODESPACES (optional) ===
# 6. Build production version from main
git checkout main
./build.sh
# → Creates Build 149 [main]
```

---

## 🌳 **Branch Naming Conventions**

- `fix/` - Bug fixes (e.g., `fix/friend-requests`)
- `feature/` - New features (e.g., `feature/zone-grouping`)
- `refactor/` - Code improvements (e.g., `refactor/location-service`)
- `test/` - Experimental changes (e.g., `test/new-ui`)

---

## 📊 **Build Tracking**

Builds from feature branches are labeled:
- `Build 148 [fix/notification-spam]` - Test build
- `Build 149 [main]` - Production build

This makes it easy to see which builds are tests vs production.

---

## 🚨 **Important Notes**

1. **Never build directly from main** until you've tested on a feature branch
2. **Always test builds** before merging to main
3. **Keep feature branches short-lived** - merge or delete within a few days
4. **One feature per branch** - easier to test and review
5. **Delete branches after merging** - keeps repo clean

---

## 🆘 **Troubleshooting**

**"I'm on the wrong branch!"**
```bash
git checkout <correct-branch>
```

**"I forgot which branch I'm on"**
```bash
git branch --show-current
```

**"I want to abandon this branch"**
```bash
git checkout main
git branch -D fix/bad-idea
git push origin --delete fix/bad-idea
```

**"I need to update my feature branch with main"**
```bash
git checkout fix/my-feature
git merge main
git push origin fix/my-feature
```

---

## ✅ **Quick Reference**

```bash
# Create & work on feature
git checkout -b fix/something
# ... make changes ...
git push origin fix/something

# Build test version (Codespaces)
git checkout fix/something
./build.sh

# Test in TestFlight

# Merge if good (Mac)
git checkout main
git merge fix/something
git push origin main

# Clean up
git branch -d fix/something
git push origin --delete fix/something
```

---

**This workflow protects your main branch while allowing safe testing!**
