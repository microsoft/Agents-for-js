#!/usr/bin/env python3
"""
Script to analyze GitHub issues in microsoft/Agents-for-js repository
to understand the importance of msteams channel compared to other channels.
"""

import json
import sys
import re
from collections import defaultdict, Counter
from datetime import datetime
from typing import Dict, List, Set

def load_json_data(filepath: str) -> Dict:
    """Load JSON data from a file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def check_user_org(username: str, microsoft_members: Set[str]) -> bool:
    """Check if user belongs to Microsoft organization."""
    return username.lower() in microsoft_members

def extract_channels_from_text(text: str) -> Set[str]:
    """Extract mentions of channels from issue text."""
    if not text:
        return set()
    
    text_lower = text.lower()
    channels = set()
    
    # Define channel patterns
    channel_patterns = {
        'msteams': [r'\bmsteams\b', r'\bmicrosoft\s+teams\b', r'\bteams\s+channel\b', r'\bms\s+teams\b'],
        'webchat': [r'\bwebchat\b', r'\bweb\s+chat\b'],
        'slack': [r'\bslack\b'],
        'telegram': [r'\btelegram\b'],
        'facebook': [r'\bfacebook\b', r'\bfb\s+messenger\b'],
        'directline': [r'\bdirectline\b', r'\bdirect\s+line\b'],
        'emulator': [r'\bemulator\b', r'\bbot\s+emulator\b'],
        'email': [r'\bemail\b'],
        'sms': [r'\bsms\b', r'\btwilio\b'],
        'cortana': [r'\bcortana\b'],
        'skype': [r'\bskype\b'],
        'kik': [r'\bkik\b'],
        'groupme': [r'\bgroupme\b'],
        'line': [r'\bline\s+channel\b', r'\bline\s+messenger\b'],
    }
    
    for channel, patterns in channel_patterns.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                channels.add(channel)
                break
    
    return channels

def analyze_issues(all_issues: List[Dict], microsoft_members: Set[str]) -> Dict:
    """Analyze issues to extract channel information."""
    analysis = {
        'total_issues': 0,
        'microsoft_issues': 0,
        'issues_with_channels': 0,
        'microsoft_issues_with_channels': 0,
        'channel_mentions': Counter(),
        'microsoft_channel_mentions': Counter(),
        'issues_by_channel': defaultdict(list),
        'microsoft_issues_by_channel': defaultdict(list),
        'issues_by_state': {'open': 0, 'closed': 0},
        'microsoft_issues_by_state': {'open': 0, 'closed': 0},
    }
    
    for issue in all_issues:
        analysis['total_issues'] += 1
        state = issue.get('state', '').lower()
        analysis['issues_by_state'][state] = analysis['issues_by_state'].get(state, 0) + 1
        
        username = issue.get('user', {}).get('login', '')
        is_microsoft = check_user_org(username, microsoft_members)
        
        if is_microsoft:
            analysis['microsoft_issues'] += 1
            analysis['microsoft_issues_by_state'][state] = analysis['microsoft_issues_by_state'].get(state, 0) + 1
        
        # Extract channels from title and body
        title = issue.get('title', '')
        body = issue.get('body', '')
        full_text = f"{title} {body}"
        
        channels = extract_channels_from_text(full_text)
        
        if channels:
            analysis['issues_with_channels'] += 1
            if is_microsoft:
                analysis['microsoft_issues_with_channels'] += 1
            
            for channel in channels:
                analysis['channel_mentions'][channel] += 1
                analysis['issues_by_channel'][channel].append({
                    'number': issue.get('number'),
                    'title': title,
                    'state': state,
                    'author': username,
                    'is_microsoft': is_microsoft,
                    'url': f"https://github.com/microsoft/Agents-for-js/issues/{issue.get('number')}"
                })
                
                if is_microsoft:
                    analysis['microsoft_channel_mentions'][channel] += 1
                    analysis['microsoft_issues_by_channel'][channel].append({
                        'number': issue.get('number'),
                        'title': title,
                        'state': state,
                        'author': username,
                        'url': f"https://github.com/microsoft/Agents-for-js/issues/{issue.get('number')}"
                    })
    
    return analysis

def save_analysis_json(analysis: Dict, output_file: str):
    """Save the analysis as JSON for programmatic access."""
    # Convert defaultdict and Counter to regular dicts for JSON serialization
    json_analysis = {
        'total_issues': analysis['total_issues'],
        'microsoft_issues': analysis['microsoft_issues'],
        'issues_with_channels': analysis['issues_with_channels'],
        'microsoft_issues_with_channels': analysis['microsoft_issues_with_channels'],
        'channel_mentions': dict(analysis['channel_mentions']),
        'microsoft_channel_mentions': dict(analysis['microsoft_channel_mentions']),
        'issues_by_state': analysis['issues_by_state'],
        'microsoft_issues_by_state': analysis['microsoft_issues_by_state'],
        'issues_by_channel': {k: v for k, v in analysis['issues_by_channel'].items()},
        'microsoft_issues_by_channel': {k: v for k, v in analysis['microsoft_issues_by_channel'].items()},
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(json_analysis, f, indent=2)

def generate_report(analysis: Dict, output_file: str):
    """Generate a markdown report of the analysis."""
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("# Channel Importance Analysis Report\n\n")
        f.write(f"**Generated on:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n")
        f.write("## Executive Summary\n\n")
        
        # Executive Summary
        f.write(f"This report analyzes {analysis['total_issues']} total issues in the microsoft/Agents-for-js repository ")
        f.write(f"to understand the importance of the Microsoft Teams (msteams) channel compared to other channels.\n\n")
        
        f.write("### Key Findings\n\n")
        
        # Microsoft user statistics
        ms_pct = (analysis['microsoft_issues'] / analysis['total_issues'] * 100) if analysis['total_issues'] > 0 else 0
        f.write(f"- **Total Issues Analyzed:** {analysis['total_issues']}\n")
        f.write(f"- **Issues by Microsoft Members:** {analysis['microsoft_issues']} ({ms_pct:.1f}%)\n")
        f.write(f"- **Open Issues:** {analysis['issues_by_state']['open']}\n")
        f.write(f"- **Closed Issues:** {analysis['issues_by_state']['closed']}\n")
        f.write(f"- **Microsoft Open Issues:** {analysis['microsoft_issues_by_state']['open']}\n")
        f.write(f"- **Microsoft Closed Issues:** {analysis['microsoft_issues_by_state']['closed']}\n\n")
        
        # Channel mentions
        if analysis['microsoft_channel_mentions']:
            msteams_count = analysis['microsoft_channel_mentions'].get('msteams', 0)
            total_ms_channel_mentions = sum(analysis['microsoft_channel_mentions'].values())
            msteams_pct = (msteams_count / total_ms_channel_mentions * 100) if total_ms_channel_mentions > 0 else 0
            
            f.write(f"- **Issues with Channel Mentions (All):** {analysis['issues_with_channels']}\n")
            f.write(f"- **Issues with Channel Mentions (Microsoft):** {analysis['microsoft_issues_with_channels']}\n")
            f.write(f"- **Microsoft Teams Mentions (by Microsoft members):** {msteams_count}\n")
            f.write(f"- **Microsoft Teams Share of Channel Mentions:** {msteams_pct:.1f}%\n\n")
        
        f.write("---\n\n")
        
        # Detailed Statistics
        f.write("## Detailed Channel Statistics\n\n")
        
        f.write("### All Channel Mentions (All Users)\n\n")
        if analysis['channel_mentions']:
            f.write("| Channel | Mentions | Percentage |\n")
            f.write("|---------|----------|------------|\n")
            total_mentions = sum(analysis['channel_mentions'].values())
            for channel, count in analysis['channel_mentions'].most_common():
                pct = (count / total_mentions * 100) if total_mentions > 0 else 0
                f.write(f"| {channel} | {count} | {pct:.1f}% |\n")
        else:
            f.write("*No channel mentions found in issues.*\n")
        
        f.write("\n### Channel Mentions by Microsoft Organization Members\n\n")
        if analysis['microsoft_channel_mentions']:
            f.write("| Channel | Mentions | Percentage |\n")
            f.write("|---------|----------|------------|\n")
            total_ms_mentions = sum(analysis['microsoft_channel_mentions'].values())
            for channel, count in analysis['microsoft_channel_mentions'].most_common():
                pct = (count / total_ms_mentions * 100) if total_ms_mentions > 0 else 0
                f.write(f"| {channel} | {count} | {pct:.1f}% |\n")
        else:
            f.write("*No channel mentions found in issues by Microsoft members.*\n")
        
        f.write("\n---\n\n")
        
        # Microsoft Teams Specific Analysis
        f.write("## Microsoft Teams (msteams) Analysis\n\n")
        
        msteams_issues = analysis['issues_by_channel'].get('msteams', [])
        msteams_ms_issues = analysis['microsoft_issues_by_channel'].get('msteams', [])
        
        f.write(f"### Overview\n\n")
        f.write(f"- **Total Issues Mentioning Microsoft Teams:** {len(msteams_issues)}\n")
        f.write(f"- **Issues by Microsoft Members:** {len(msteams_ms_issues)}\n")
        
        if msteams_ms_issues:
            open_count = sum(1 for i in msteams_ms_issues if i['state'] == 'open')
            closed_count = len(msteams_ms_issues) - open_count
            f.write(f"- **Open Issues (Microsoft):** {open_count}\n")
            f.write(f"- **Closed Issues (Microsoft):** {closed_count}\n\n")
            
            f.write("### Microsoft Teams Issues by Microsoft Members\n\n")
            f.write("| # | State | Title | Author |\n")
            f.write("|---|-------|-------|--------|\n")
            for issue in sorted(msteams_ms_issues, key=lambda x: x['number'], reverse=True):
                state_icon = "🟢" if issue['state'] == 'open' else "🔴"
                f.write(f"| [#{issue['number']}]({issue['url']}) | {state_icon} {issue['state']} | {issue['title'][:80]} | @{issue['author']} |\n")
        
        f.write("\n---\n\n")
        
        # Other Channels Analysis
        f.write("## Other Channels Analysis\n\n")
        
        for channel in sorted(analysis['microsoft_issues_by_channel'].keys()):
            if channel != 'msteams':
                channel_issues = analysis['microsoft_issues_by_channel'][channel]
                if channel_issues:
                    f.write(f"### {channel.title()} Channel\n\n")
                    f.write(f"**Issues by Microsoft Members:** {len(channel_issues)}\n\n")
                    
                    open_count = sum(1 for i in channel_issues if i['state'] == 'open')
                    closed_count = len(channel_issues) - open_count
                    f.write(f"- Open: {open_count}\n")
                    f.write(f"- Closed: {closed_count}\n\n")
                    
                    f.write("| # | State | Title | Author |\n")
                    f.write("|---|-------|-------|--------|\n")
                    for issue in sorted(channel_issues, key=lambda x: x['number'], reverse=True)[:10]:  # Limit to 10
                        state_icon = "🟢" if issue['state'] == 'open' else "🔴"
                        f.write(f"| [#{issue['number']}]({issue['url']}) | {state_icon} {issue['state']} | {issue['title'][:60]} | @{issue['author']} |\n")
                    
                    if len(channel_issues) > 10:
                        f.write(f"\n*...and {len(channel_issues) - 10} more issues*\n")
                    
                    f.write("\n")
        
        f.write("---\n\n")
        
        # Conclusion
        f.write("## Conclusion\n\n")
        
        if analysis['microsoft_channel_mentions']:
            msteams_count = analysis['microsoft_channel_mentions'].get('msteams', 0)
            total_ms_mentions = sum(analysis['microsoft_channel_mentions'].values())
            
            if msteams_count > 0:
                msteams_pct = (msteams_count / total_ms_mentions * 100) if total_ms_mentions > 0 else 0
                
                # Compare with other top channels
                top_channels = analysis['microsoft_channel_mentions'].most_common(5)
                
                f.write(f"Based on the analysis of {analysis['microsoft_issues']} issues created by Microsoft organization members:\n\n")
                f.write(f"1. **Microsoft Teams (msteams) accounts for {msteams_pct:.1f}% of all channel mentions** ")
                f.write(f"in issues created by Microsoft members.\n\n")
                
                if len(top_channels) > 1:
                    f.write(f"2. **Top {len(top_channels)} channels by mention frequency:**\n")
                    for i, (channel, count) in enumerate(top_channels, 1):
                        pct = (count / total_ms_mentions * 100) if total_ms_mentions > 0 else 0
                        f.write(f"   {i}. {channel}: {count} mentions ({pct:.1f}%)\n")
                
                f.write(f"\n3. **Importance Assessment:** ")
                if msteams_count == max(c for c in analysis['microsoft_channel_mentions'].values()):
                    f.write("Microsoft Teams is the **most mentioned channel** in issues by Microsoft members, ")
                    f.write("indicating it is the **highest priority channel** for this project.\n\n")
                elif msteams_pct >= 30:
                    f.write("Microsoft Teams is a **very important channel** for this project, ")
                    f.write("representing a significant portion of channel-related discussions.\n\n")
                elif msteams_pct >= 15:
                    f.write("Microsoft Teams is an **important channel** for this project, ")
                    f.write("though other channels also receive significant attention.\n\n")
                else:
                    f.write("While Microsoft Teams is mentioned, other channels appear to have equal or greater importance ")
                    f.write("based on issue mentions by Microsoft members.\n\n")
            else:
                f.write("Microsoft Teams (msteams) was not explicitly mentioned in issues created by Microsoft organization members, ")
                f.write("though it may still be an important channel based on the repository's purpose.\n\n")
        else:
            f.write("No channel-specific mentions were found in issues created by Microsoft organization members. ")
            f.write("This could indicate that channel-specific discussions happen in other venues (PRs, internal discussions, etc.).\n\n")

def main():
    """Main execution function."""
    print("Loading issue data...")
    
    # Load all issue data from the temp files
    open_issues_file = "/tmp/1769829087591-copilot-tool-output-jtyrd3.txt"
    closed_issues_file1 = "/tmp/1769829088653-copilot-tool-output-20y2o8.txt"
    closed_issues_file2 = "/tmp/1769829098972-copilot-tool-output-nxcr25.txt"
    
    all_issues = []
    
    # Load open issues
    try:
        open_data = load_json_data(open_issues_file)
        all_issues.extend(open_data.get('issues', []))
        print(f"Loaded {len(open_data.get('issues', []))} open issues")
    except Exception as e:
        print(f"Error loading open issues: {e}")
    
    # Load closed issues (page 1)
    try:
        closed_data1 = load_json_data(closed_issues_file1)
        all_issues.extend(closed_data1.get('issues', []))
        print(f"Loaded {len(closed_data1.get('issues', []))} closed issues (page 1)")
    except Exception as e:
        print(f"Error loading closed issues (page 1): {e}")
    
    # Load closed issues (page 2)
    try:
        closed_data2 = load_json_data(closed_issues_file2)
        all_issues.extend(closed_data2.get('issues', []))
        print(f"Loaded {len(closed_data2.get('issues', []))} closed issues (page 2)")
    except Exception as e:
        print(f"Error loading closed issues (page 2): {e}")
    
    print(f"\nTotal issues loaded: {len(all_issues)}")
    
    # Define known Microsoft organization members based on the data
    # We'll extract this from the loaded issues
    microsoft_members = set()
    
    # Common Microsoft domains and known Microsoft members
    # These are identified from issue authors and common patterns
    known_ms_members = {
        'rido-min', 'victoriaacqua', 'jhontsouth', 'alejandrocolman', 
        'luchoperes', 'tracyboehrer', 'mattb-msft', 'stevenic',
        'mohammed-msft', 'guy-microsoft', 'jaswanthmicrosoft',
        'cleemullins', 'ceciliaavila', 'sarahcritchley', 'nliu-ms',
        'benbrown', 'stevkan', 'joerodgers'
    }
    
    # Check all users and identify Microsoft members
    # Also check for common patterns: -msft suffix, -microsoft suffix
    for issue in all_issues:
        username = issue.get('user', {}).get('login', '').lower()
        # Add known members
        if username in known_ms_members:
            microsoft_members.add(username)
        # Check for Microsoft patterns in username
        elif '-msft' in username or '-microsoft' in username or 'microsoft' in username:
            microsoft_members.add(username)
    
    print(f"Identified {len(microsoft_members)} Microsoft organization members")
    print(f"Microsoft members: {sorted(microsoft_members)}")
    
    # Analyze issues
    print("\nAnalyzing issues...")
    analysis = analyze_issues(all_issues, microsoft_members)
    
    # Generate report
    output_file = "/home/runner/work/Agents-for-js/Agents-for-js/CHANNEL_ANALYSIS_REPORT.md"
    print(f"\nGenerating report: {output_file}")
    generate_report(analysis, output_file)
    
    # Save JSON version
    json_output_file = "/home/runner/work/Agents-for-js/Agents-for-js/channel_analysis_data.json"
    print(f"Saving JSON data: {json_output_file}")
    save_analysis_json(analysis, json_output_file)
    
    print(f"\n✅ Report generated successfully!")
    print(f"\nSummary:")
    print(f"  - Total issues: {analysis['total_issues']}")
    print(f"  - Microsoft issues: {analysis['microsoft_issues']}")
    print(f"  - Issues with channel mentions: {analysis['issues_with_channels']}")
    print(f"  - Microsoft issues with channel mentions: {analysis['microsoft_issues_with_channels']}")
    
    if analysis['microsoft_channel_mentions']:
        print(f"\n  Top channels (Microsoft members):")
        for channel, count in analysis['microsoft_channel_mentions'].most_common(5):
            print(f"    - {channel}: {count} mentions")

if __name__ == "__main__":
    main()
