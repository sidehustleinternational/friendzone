# FriendZone Build Workflow

## 🎯 Standardized Process

### **Step 1: Make Changes (On Mac)**

Work in your preferred IDE on Mac:

```bash
# Make your code changes
# Test locally if needed

# Commit and push
git add -A
git commit -m "Fix: [describe what you fixed]"
git push origin main
```

### **Step 2: Build (In Codespaces)**

Open Codespaces terminal and run:

```bash
./build.sh
```

That's it! The script will:
1. ✅ Pull your latest changes from GitHub
2. ✅ Show current build number
3. ✅ Auto-increment to next build number
4. ✅ Commit and push the build number
5. ✅ Start EAS build
6. ✅ Show build link

---

## 📋 What the Script Does

```
🔄 Pulling latest changes from GitHub...
📦 Current build number: Build 147
🆙 Incrementing to Build 148...
💾 Committing build number...
🏗️  Starting EAS build for iOS...
✅ Build 148 started successfully!
📱 Check TestFlight in ~15-20 minutes
```

---

## 🚨 Why This Prevents Issues

**Problem:** Changes made on Mac weren't in Codespaces when building
**Solution:** Script always pulls latest before building

**Problem:** Build numbers got out of sync
**Solution:** Script auto-increments from current number

**Problem:** Forgot what was in the build
**Solution:** Script includes last commit message in build commit

---

## 🔧 Manual Build (If Needed)

If you need to build manually:

```bash
# In Codespaces
git pull origin main
CURRENT=$(grep '"buildNumber"' app.json | grep -o '[0-9]*')
NEXT=$((CURRENT + 1))
sed -i "s/\"buildNumber\": \"$CURRENT\"/\"buildNumber\": \"$NEXT\"/" app.json
git add app.json
git commit -m "Build $NEXT"
git push origin main
eas build --platform ios --profile production
```

---

## 📱 After Build Completes

1. Build appears in TestFlight (~15-20 minutes)
2. Test the new build
3. Report any issues
4. Repeat workflow for fixes

---

## 🎯 Best Practices

1. **Always commit and push from Mac first**
2. **Always run build.sh from Codespaces**
3. **Never edit code in both places simultaneously**
4. **Use descriptive commit messages** (they appear in build commits)
5. **Test builds before releasing to users**

---

## 🆘 Troubleshooting

**Script fails with "nothing to commit":**
- You forgot to push from Mac first
- Run `git push origin main` on Mac, then try again

**Script fails with "merge conflict":**
- You edited in both places
- Resolve conflicts manually, then run script

**Build number seems wrong:**
- Check `app.json` to see current number
- Script always increments from what's in the file

---

## 📝 Example Workflow

```bash
# On Mac
git add src/screens/FriendsScreen.tsx
git commit -m "Fix: Friend requests now disappear after accept"
git push origin main

# In Codespaces
./build.sh

# Output:
# 🔄 Pulling latest changes from GitHub...
# 📦 Current build number: Build 147
# 🆙 Incrementing to Build 148...
# 💾 Committing build number...
# 🏗️  Starting EAS build for iOS...
# ✅ Build 148 started successfully!
```

Done! ✅
