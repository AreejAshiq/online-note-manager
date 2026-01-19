from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_login import LoginManager, login_user, login_required, logout_user, current_user
from flask_migrate import Migrate
import json
from datetime import datetime, timezone

# models.py se db object aur saare models import karein
from models import db, User, Note

# App ko initialize karein
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Database aur Migrations ko app ke sath connect karein
db.init_app(app)
migrate = Migrate(app, db)

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ----------------------------------------------------
# -------------------- ROUTES ------------------------
# ----------------------------------------------------

@app.route('/')
def home():
    notes_data = []
    
    if current_user.is_authenticated:
        
        user_notes = Note.query.filter_by(user_id=current_user.id).order_by(
            Note.is_pinned.desc(), 
            Note.updated_at.desc()
        ).all()
        
        notes_data = [note.to_dict() for note in user_notes]
        
        return render_template('home.html', notes=notes_data, is_authenticated=True, current_user=current_user)
    
    return render_template('home.html', notes=[], is_authenticated=False, current_user=None)

# API Route: Logged-in User ke liye Naya Note banana
@app.route('/create_note', methods=['POST'])
@login_required 
def create_note():
    data = request.get_json()
    
    title = data.get('title')
    content = data.get('content')
    is_pinned = data.get('is_pinned', False) 
    category = data.get('category', 'Miscellaneous')
    reminder_date_str = data.get('reminder_date', None)
    
    if isinstance(is_pinned, str):
        is_pinned = is_pinned.lower() == 'true'
    
    # Date string ko datetime object mein convert karein
    reminder_date = None
    if reminder_date_str:
        try:
            # Format: 'YYYY-MM-DDTHH:MM' (datetime-local se aata hai)
            reminder_date = datetime.strptime(reminder_date_str, '%Y-%m-%dT%H:%M') 
        except ValueError:
            print(f"Invalid date format received: {reminder_date_str}")
            pass
    
    if not title and not content:
        return jsonify({'status': 'error', 'message': 'Note title or content is required'}), 400

    #New Note object create karna 
    try:
        new_note = Note(
            title=title or 'Untitled Note',
            content=content or '',
            user_id=current_user.id,
            is_pinned=is_pinned,
            category=category,
            reminder_date=reminder_date,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.session.add(new_note)
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': 'Note created successfully',
            'note': new_note.to_dict() 
        })

    except Exception as e:
        db.session.rollback()
        print(f"Database error: {e}")
        return jsonify({'status': 'error', 'message': 'Could not save note to database'}), 500

# API Route: Logged-in User ke liye Note delete karna
@app.route('/delete_note/<int:note_id>', methods=['DELETE'])
@login_required 
def delete_note(note_id):
    note = Note.query.filter_by(id=note_id, user_id=current_user.id).first()
    
    if not note:
        return jsonify({'status': 'error', 'message': 'Note not found or unauthorized'}), 404

    try:
        db.session.delete(note)
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': f'Note deleted successfully.'
        })

    except Exception as e:
        db.session.rollback()
        print(f"Database error during deletion: {e}")
        return jsonify({'status': 'error', 'message': 'Could not delete note from database'}), 500

# API Route: Logged-in User ke liye Note update karna
@app.route('/update_note/<int:note_id>', methods=['PUT'])
@login_required 
def update_note(note_id):
    note = Note.query.filter_by(id=note_id, user_id=current_user.id).first()
    
    if not note:
        return jsonify({'status': 'error', 'message': 'Note not found or unauthorized'}), 404

    data = request.get_json()
    new_title = data.get('title')
    new_content = data.get('content')
    new_category = data.get('category')
    new_is_pinned = data.get('is_pinned')
    new_reminder_date_str = data.get('reminder_date')

    # Date string ko datetime object mein convert karein
    new_reminder_date = None
    if new_reminder_date_str:
        try:
            new_reminder_date = datetime.strptime(new_reminder_date_str, '%Y-%m-%dT%H:%M') 
        except ValueError:
            pass
            
    # Bool conversion
    if isinstance(new_is_pinned, str):
        new_is_pinned = new_is_pinned.lower() == 'true'

    if not new_title and not new_content and new_category is None and new_is_pinned is None and new_reminder_date_str is None:
         return jsonify({'status': 'error', 'message': 'No data provided to update'}), 400

    try:
        note.title = new_title or note.title
        note.content = new_content or note.content
        
        if new_category is not None:
             note.category = new_category

        if new_is_pinned is not None:
             note.is_pinned = new_is_pinned
        
        
        if new_reminder_date_str is not None:
            note.reminder_date = new_reminder_date 

        note.updated_at = datetime.now(timezone.utc) 
        
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': f'Note updated successfully.',
            'note': note.to_dict() 
        })

    except Exception as e:
        db.session.rollback()
        print(f"Database error during update: {e}")
        return jsonify({'status': 'error', 'message': 'Could not update note in database'}), 500

# API Route: Logged-in User ke liye Notes Search karna
@app.route('/search_notes', methods=['GET'])
@login_required 
def search_notes():
    query = request.args.get('q', '').strip()
    
    if not query:
        # Agar query khali hai, toh saare notes wapas kar do (Pinned/Date order mein)
        all_notes = Note.query.filter_by(user_id=current_user.id).order_by(
            Note.is_pinned.desc(), 
            Note.updated_at.desc()
        ).all()
        return jsonify({
            'status': 'success', 
            'notes': [note.to_dict() for note in all_notes]
        })

    # Search query ko Title aur Content dono columns mein check karein (case-insensitive)
    search_pattern = f"%{query}%"
    
    filtered_notes = Note.query.filter(
        Note.user_id == current_user.id,
        (Note.title.ilike(search_pattern)) | 
        (Note.content.ilike(search_pattern))
    ).order_by(Note.is_pinned.desc(), Note.updated_at.desc()).all()

    return jsonify({
        'status': 'success',
        'notes': [note.to_dict() for note in filtered_notes]
    })


# API Route: Local Notes ko Cloud mein Sync karna
@app.route('/sync_notes', methods=['POST'])
@login_required
def sync_notes():
    try:
        local_notes_data = request.get_json()
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid JSON data received'}), 400

    notes_synced_count = 0
    
    for local_note in local_notes_data:
        if not local_note.get('title') and not local_note.get('content'):
             continue

        reminder_date_str = local_note.get('reminder_date', None)
        reminder_date = None
        if reminder_date_str:
            try:
                # Local Storage se aayi hui ISO string ko parse karein
                # Replace 'Z' for proper parsing if it's coming from an ISO string
                reminder_date = datetime.fromisoformat(reminder_date_str.replace('Z', '+00:00')) 
            except Exception:
                pass
        
        new_cloud_note = Note(
            title=local_note.get('title', 'Untitled'),
            content=local_note.get('content', ''),
            user_id=current_user.id,
            category=local_note.get('category', 'Miscellaneous'),
            is_pinned=local_note.get('is_pinned', False),
            reminder_date=reminder_date,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.session.add(new_cloud_note)
        notes_synced_count += 1
            
    db.session.commit()
    
    # Sync ke baad saare notes nikaal kar front-end ko wapas bhejte hain
    synced_notes = Note.query.filter_by(user_id=current_user.id).order_by(Note.is_pinned.desc(), Note.updated_at.desc()).all()
    synced_notes_data = [note.to_dict() for note in synced_notes]
    
    return jsonify({
        'status': 'success', 
        'synced_count': notes_synced_count,
        'cloud_notes': synced_notes_data 
    })


# Login route
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('home'))

    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password') 

        user = User.query.filter_by(username=username).first() 

        if user and user.check_password(password):
            login_user(user) 
            return redirect(url_for('home'))
        else:
            flash('Invalid username or password.', 'error')
    
    return render_template('login.html')

# Signup route
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        # New: Check for empty username or password first
        if not username or not password:
            flash('Username and Password are required.', 'error')
            return redirect(url_for('signup'))

        # Existing validation logic starts here
        if len(password) < 8:
            flash('Password must be at least 8 characters long.', 'error')
        elif not any(char.isdigit() for char in password):
            flash('Password must contain at least one number.', 'error')
        elif not any(char.isupper() for char in password):
            flash('Password must contain at least one capital letter.', 'error')
        elif username == password:
            flash('Username and password cannot be the same.', 'error')
        else:
            existing_user = User.query.filter_by(username=username).first()
            if existing_user:
                flash('Username already exists. Please choose a different one.', 'error')
            else:
                new_user = User(username=username) 
                new_user.set_password(password) 
                db.session.add(new_user)
                db.session.commit()
                flash('Account created successfully! You can now log in.', 'success')
                return redirect(url_for('login'))
    
    return render_template('signup.html')

# Logout route
@app.route('/logout')
@login_required 
def logout():
    logout_user() 
    flash('You have been logged out.', 'success')
    return redirect(url_for('login'))


if __name__ == '__main__':
    with app.app_context():
        pass
    app.run(debug=True)